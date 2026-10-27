/**
 * Envía el aviso directo (campaña de seguridad Collosus DH) uno por destinatario, por Resend
 * (dominio crossmountain.cl verificado en Resend).
 *
 *   npx tsx scripts/enviar-aviso.ts <clientes|distribuidores> [opciones]
 *
 * Sin opciones solo simula: muestra a quién se enviaría (correos enmascarados) y no envía nada.
 *
 * --prueba[=correo,…]     envía un correo de prueba a cada dirección (por defecto a la cuenta remitente), sin CC ni marcar la lista
 * --enviar                envío real a la lista; marca "Correo enviado" en el CSV después de cada envío
 * --prioridad=1           solo filas cuya Prioridad empieza con ese valor (p. ej. las demos afectadas)
 * --incluir-devueltas     incluye filas "3 - devolvió todo" (por defecto se omiten)
 * --limite=N              envía como máximo N correos en esta corrida
 * --csv=ruta              lista alternativa (por defecto ~/Downloads/contactos-collosus-dh/<lista>.csv)
 *
 * La clave de API de Resend se pide oculta en la terminal (o RESEND_API_KEY). Nunca se guarda.
 * Las listas tienen datos personales: viven fuera del repositorio y la salida enmascara los correos.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { parseArgs } from "./_env";
import { outreachCustomerEmail, outreachDistributorEmail } from "../src/lib/email/templates";

const SITE_URL = "https://recallcollosusdh.cl";
const CONTACT_EMAIL = "contacto@crossmountain.cl";
const PAUSE_MS = 3_000;

const LISTS = {
  clientes: { file: "clientes-finales.csv", from: "contacto@crossmountain.cl", cc: [] as string[], render: outreachCustomerEmail },
  distribuidores: { file: "distribuidores.csv", from: "b2b@crossmountain.cl", cc: ["frojas@crossports.cl"], render: outreachDistributorEmail },
} as const;
type ListName = keyof typeof LISTS;

const SENT_COL = "Correo enviado";

/** CSV con ";" y comillas dobles (RFC 4180). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ";") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

function mask(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void };
    let prompted = false;
    out._writeToOutput = (s: string) => {
      if (!prompted) { process.stdout.write(s); prompted = true; }
    };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer.replace(/\s+/g, "")); });
  });
}

/** Cambia las imágenes remotas por adjuntos en línea (cid): se ven aunque el cliente bloquee imágenes externas. */
function inlineImages(html: string) {
  const files: Record<string, string> = {
    [`${SITE_URL}/brand/polygon-logo.png`]: "public/brand/polygon-logo.png",
    [`${SITE_URL}/correo/collosus-dh7.jpg`]: "public/correo/collosus-dh7.jpg",
    [`${SITE_URL}/correo/collosus-dh9.jpg`]: "public/correo/collosus-dh9.jpg",
  };
  const attachments: { filename: string; content: string; content_id: string }[] = [];
  for (const [url, file] of Object.entries(files)) {
    if (!html.includes(url)) continue;
    const cid = path.basename(file, path.extname(file));
    html = html.replaceAll(url, `cid:${cid}`);
    attachments.push({ filename: path.basename(file), content: fs.readFileSync(path.join(process.cwd(), file)).toString("base64"), content_id: cid });
  }
  return { html, attachments };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const listName = positional[0] as ListName;
  if (!(listName in LISTS)) {
    console.error("Uso: npx tsx scripts/enviar-aviso.ts <clientes|distribuidores> [--prueba[=correo]] [--enviar] [--prioridad=1] [--incluir-devueltas] [--limite=N]");
    process.exit(1);
  }
  const list = LISTS[listName];
  const csvPath = typeof flags.csv === "string" ? flags.csv : path.join(os.homedir(), "Downloads", "contactos-collosus-dh", list.file);
  const test = flags.prueba !== undefined;
  const testTo = typeof flags.prueba === "string" ? flags.prueba : list.from;
  const real = flags.enviar === true && !test;
  const limit = typeof flags.limite === "string" ? Number(flags.limite) : Infinity;
  const priority = typeof flags.prioridad === "string" ? flags.prioridad : undefined;

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
  const header = rows[0]!;
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Falta la columna "${name}" en ${csvPath}`);
    return i;
  };
  const [iEmail, iPriority, iSent] = [col("Email"), col("Prioridad"), col(SENT_COL)];

  const pending = rows.slice(1).filter((r) => {
    if ((r[iSent] ?? "").trim()) return false;
    if (!flags["incluir-devueltas"] && /devolvi/i.test(r[iPriority] ?? "")) return false;
    if (priority && !(r[iPriority] ?? "").startsWith(priority)) return false;
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((r[iEmail] ?? "").trim());
  });
  const batch = pending.slice(0, limit);
  const mail = list.render({ siteUrl: SITE_URL, contactEmail: CONTACT_EMAIL });

  console.log(`Lista: ${listName} (${rows.length - 1} filas) · Remitente: ${list.from}${list.cc.length ? ` · CC: ${list.cc.join(", ")}` : ""}`);
  console.log(`Asunto: ${mail.subject}`);
  console.log(`Pendientes: ${pending.length} · En esta corrida: ${test ? `1 prueba a ${testTo}` : batch.length}`);

  if (!test && !real) {
    for (const r of batch) console.log(`  [${r[iPriority]}] ${mask(r[iEmail]!.trim())}`);
    console.log("\nSIMULACIÓN: no se envió nada. Usa --prueba o --enviar.");
    return;
  }

  // Se descartan espacios y restos del pegado (secuencias de "bracketed paste").
  const raw = process.env.RESEND_API_KEY || (await askHidden("Clave de API de Resend (re_…): "));
  const key = raw.replace(/\x1b\[20[01]~/g, "").replace(/\s+/g, "");
  if (!key.startsWith("re_")) throw new Error("La clave de Resend debe empezar con re_: no se envía nada.");

  const { html, attachments } = inlineImages(mail.html);
  const send = async (to: string, cc: string[]): Promise<string> => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Cross Mountain <${list.from}>`,
        to: [to],
        cc: cc.length ? cc : undefined,
        reply_to: list.from,
        subject: mail.subject,
        text: mail.text,
        html,
        attachments,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? "sin detalle"}`);
    return body.id;
  };

  if (test) {
    for (const to of testTo.split(",").map((s) => s.trim()).filter(Boolean)) {
      const id = await send(to, []);
      console.log(`Prueba enviada a ${to} (id ${id}). No se marcó la lista.`);
    }
    return;
  }

  let ok = 0;
  for (const [n, r] of batch.entries()) {
    const to = r[iEmail]!.trim();
    try {
      await send(to, [...list.cc]);
      r[iSent] = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });
      fs.writeFileSync(csvPath, toCsv(rows));
      ok++;
      console.log(`  ${n + 1}/${batch.length} enviado a ${mask(to)}`);
    } catch (err) {
      console.log(`  ${n + 1}/${batch.length} ERROR con ${mask(to)}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (n < batch.length - 1) await sleep(PAUSE_MS);
  }
  console.log(`\nListo: ${ok} de ${batch.length} enviados. Los enviados quedaron marcados en "${SENT_COL}".`);
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
