import { Resend } from "resend";

export async function sendAutomationEmail(params: { to: string; subject: string; text: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    console.warn("[automations] RESEND_API_KEY / RESEND_FROM_EMAIL ausentes — email não enviado.");
    return false;
  }
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      text: params.text,
    });
    return true;
  } catch (e) {
    console.error("[automations] Falha ao enviar email:", e);
    return false;
  }
}
