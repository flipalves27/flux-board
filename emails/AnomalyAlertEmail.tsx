import React from "react";
import { Html, Head, Body, Container, Heading, Text, Section, Hr, Link } from "@react-email/components";

export type AnomalyAlertEmailProps = {
  title: string;
  boardLine: string;
  diagnosis: string;
  suggestedAction: string;
  boardUrl: string;
  severity: string;
  platformLabel?: string;
  logoUrl?: string;
};

export function AnomalyAlertEmail({
  title,
  boardLine,
  diagnosis,
  suggestedAction,
  boardUrl,
  severity,
  platformLabel,
  logoUrl,
}: AnomalyAlertEmailProps) {
  const brand = platformLabel || "Flux-Board";
  return (
    <Html>
      <Head />
      <Body style={body}>
        <Container style={container}>
          {logoUrl && /^https?:\/\//i.test(logoUrl) ? (
            <Section style={{ marginBottom: 16, textAlign: "center" as const }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- React Email: sem next/image */}
              <img src={logoUrl} alt="" width={140} style={{ maxWidth: "100%", height: "auto" }} />
            </Section>
          ) : null}
          <Heading style={h1}>Alerta de fluxo — {severity.toUpperCase()}</Heading>
          <Text style={textStrong}>{title}</Text>
          <Section style={box}>
            <Text style={label}>Board</Text>
            <Text style={text}>{boardLine}</Text>
          </Section>
          <Section style={box}>
            <Text style={label}>Diagnóstico</Text>
            <Text style={text}>{diagnosis}</Text>
          </Section>
          <Section style={boxAccent}>
            <Text style={label}>Ação sugerida (IA)</Text>
            <Text style={text}>{suggestedAction}</Text>
          </Section>
          <Hr style={hr} />
          <Link href={boardUrl} style={link}>
            Abrir no {brand}
          </Link>
          <Text style={footer}>Mensagem automática do monitor de anomalias {brand}.</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#0c0f14",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container: React.CSSProperties = {
  margin: "0 auto",
  padding: "24px 20px 40px",
  maxWidth: 560,
};

const h1: React.CSSProperties = {
  color: "#e8ecf4",
  fontSize: 20,
  fontWeight: 700,
  margin: "0 0 16px",
};

const textStrong: React.CSSProperties = {
  color: "#e8ecf4",
  fontSize: 16,
  fontWeight: 600,
  margin: "0 0 16px",
  lineHeight: 1.45,
};

const text: React.CSSProperties = {
  color: "#c5cedd",
  fontSize: 14,
  lineHeight: 1.55,
  margin: "4px 0 0",
};

const label: React.CSSProperties = {
  color: "#7d8da6",
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: 0.6,
  margin: 0,
  fontWeight: 600,
};

const box: React.CSSProperties = {
  backgroundColor: "#141a22",
  borderRadius: 8,
  border: "1px solid #243044",
  padding: "12px 14px",
  marginBottom: 12,
};

const boxAccent: React.CSSProperties = {
  ...box,
  borderColor: "#2d4a6f",
  backgroundColor: "#121c2a",
};

const hr: React.CSSProperties = {
  borderColor: "#243044",
  margin: "20px 0",
};

const link: React.CSSProperties = {
  color: "#6ec8ff",
  fontSize: 14,
  fontWeight: 600,
};

const footer: React.CSSProperties = {
  color: "#5c6b82",
  fontSize: 11,
  marginTop: 24,
  lineHeight: 1.5,
};
