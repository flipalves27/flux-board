import React from "react";
import {
  Html,
  Head,
  Body,
  Container,
  Heading,
  Text,
  Section,
  Hr,
  Link,
} from "@react-email/components";

export type WeeklyDigestOverdueCard = {
  title: string;
  bucket: string;
  progress: string;
  dueDate: string; // YYYY-MM-DD
  daysOverdue: number;
  action: string;
};

export type WeeklyDigestBoard = {
  boardName: string;
  created: number;
  moved: number;
  concluded: number;
  throughputCurrent: number;
  throughputPrevious: number;
  overdueCards: WeeklyDigestOverdueCard[];
  insight: string;
  summary: string;
};

export type WeeklyDigestOkrSection = {
  quarter: string;
  headline: string;
  bullets: string[];
  /** KRs com projeção linear abaixo do limiar (ex.: 80%). */
  riskAlerts: Array<{ objectiveTitle: string; krTitle: string; line: string }>;
};

export type WeeklyDigestEmailProps = {
  orgName: string;
  weekLabel: string;
  appUrl?: string;
  boards: WeeklyDigestBoard[];
  okrSection?: WeeklyDigestOkrSection | null;
};

export function WeeklyDigestEmail({ orgName, weekLabel, appUrl, boards, okrSection }: WeeklyDigestEmailProps) {
  const safeAppUrl = appUrl || "#";
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Weekly Digest IA</Heading>
          <Text style={muted}>Organização: {orgName}</Text>
          <Text style={muted}>Período: {weekLabel}</Text>
          <Hr style={hr} />

          {okrSection && (
            <Section style={card}>
              <Heading as="h2" style={h2}>
                IA Goals — {okrSection.quarter}
              </Heading>
              <Text style={p}>
                <strong>Projeção linear + recomendação semanal</strong>
              </Text>
              <Text style={p}>{okrSection.headline}</Text>
              {okrSection.riskAlerts.length > 0 && (
                <>
                  <Text style={label}>Alertas automáticos (risco de meta)</Text>
                  {okrSection.riskAlerts.map((a) => (
                    <Text key={`${a.objectiveTitle}-${a.krTitle}`} style={riskLine}>
                      <strong>{a.objectiveTitle}</strong> — {a.krTitle}: {a.line}
                    </Text>
                  ))}
                </>
              )}
              <Text style={label}>Recomendações</Text>
              {okrSection.bullets.length === 0 ? (
                <Text style={p}>(sem itens)</Text>
              ) : (
                okrSection.bullets.map((b, i) => (
                  <Text key={i} style={p}>
                    • {b}
                  </Text>
                ))
              )}
            </Section>
          )}

          {boards.length === 0 ? (
            <Text style={p}>Não encontramos atividade relevante para gerar o digest desta semana.</Text>
          ) : (
            boards.map((b) => (
              <Section key={b.boardName} style={card}>
                <Heading as="h3" style={h2}>
                  {b.boardName}
                </Heading>

                <Text style={line}>
                  <strong>Criados:</strong> {b.created} | <strong>Movidos:</strong> {b.moved}
                </Text>
                <Text style={line}>
                  <strong>Concluídos:</strong> {b.concluded} | <strong>Throughput:</strong> {b.throughputCurrent} (vs {b.throughputPrevious})
                </Text>

                <Text style={p}>{b.summary}</Text>

                <Text style={label}>Insight IA</Text>
                <Text style={p}>{b.insight}</Text>

                <Text style={label}>Cards atrasados com sugestão</Text>
                {b.overdueCards.length === 0 ? (
                  <Text style={p}>Nenhum card atrasado no momento.</Text>
                ) : (
                  b.overdueCards.slice(0, 5).map((c) => (
                    <Section key={c.title} style={overdueCard}>
                      <Text style={{ ...p, marginBottom: 4 }}>
                        <strong>{c.title}</strong> — {c.bucket} / {c.progress} — vcto {c.dueDate} (atraso {c.daysOverdue}d)
                      </Text>
                      <Text style={p}>{c.action}</Text>
                    </Section>
                  ))
                )}
              </Section>
            ))
          )}

          <Hr style={hr} />
          <Text style={muted}>
            Acesse seus boards:{" "}
            <Link href={`${safeAppUrl}`} style={link}>
              {safeAppUrl}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main: React.CSSProperties = {
  backgroundColor: "#0b0f17",
  color: "#e6e8ee",
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
};

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 680,
  margin: "0 auto",
  padding: "24px",
};

const hr: React.CSSProperties = {
  borderColor: "rgba(255,255,255,0.12)",
  margin: "18px 0",
};

const h1: React.CSSProperties = {
  color: "#f7c948",
  fontSize: 24,
  margin: "0 0 6px",
};

const h2: React.CSSProperties = {
  fontSize: 18,
  margin: "0 0 10px",
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.70)",
  fontSize: 13,
  margin: "6px 0",
};

const label: React.CSSProperties = {
  fontWeight: 700,
  marginTop: 12,
  color: "rgba(255,255,255,0.92)",
};

const p: React.CSSProperties = {
  fontSize: 14,
  lineHeight: "20px",
  margin: "8px 0",
  color: "rgba(255,255,255,0.92)",
};

const link: React.CSSProperties = {
  color: "#9ad8ff",
};

const card: React.CSSProperties = {
  backgroundColor: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  padding: 16,
  margin: "16px 0",
};

const overdueCard: React.CSSProperties = {
  backgroundColor: "rgba(255,170,0,0.06)",
  border: "1px solid rgba(255,170,0,0.18)",
  borderRadius: 10,
  padding: 12,
  marginTop: 10,
};

const riskLine: React.CSSProperties = {
  fontSize: 14,
  lineHeight: "20px",
  margin: "8px 0",
  color: "#ffb4b4",
  backgroundColor: "rgba(255,80,80,0.08)",
  border: "1px solid rgba(255,120,120,0.25)",
  borderRadius: 8,
  padding: "10px 12px",
};

const line: React.CSSProperties = {
  fontSize: 14,
  color: "rgba(255,255,255,0.92)",
  margin: "8px 0 0",
  lineHeight: "20px",
};

