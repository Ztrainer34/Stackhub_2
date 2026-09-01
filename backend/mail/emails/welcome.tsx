import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Button,
  Font,
} from "@react-email/components";
import * as React from "react";

// Kept deliberately in sync with mail/generated/welcome.html — that generated
// file is what the Go mailer sends, so any copy change here must be rebuilt
// (pnpm build in backend/mail) for it to reach users.
export default function Email() {
  return (
    <Html>
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Body style={main}>
        <Container style={container}>
          {/* Header Section */}
          <Section style={header}>
            <Heading style={logo}>StackHub</Heading>
            <Text style={tagline}>Knowledge Hub for Tools</Text>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={greeting}>Welcome aboard 👋</Text>

            <Text style={paragraph}>
              You&apos;re all set to start using <strong>StackHub</strong>.
            </Text>

            <Heading as="h2" style={sectionHeading}>
              A couple of ideas to get started:
            </Heading>

            <Section style={actionList}>
              <Text style={actionItem}>
                <span style={bullet}>🔍</span> Explore people&apos;s stacks and
                playbooks
              </Text>
              <Text style={actionItem}>
                <span style={bullet}>⭐</span> Add tools to your stack /
                watchlist
              </Text>
              <Text style={actionItem}>
                <span style={bullet}>📝</span> Add your playbooks to grow your
                visibility
              </Text>
            </Section>

            <Section style={ctaSection}>
              <Button href="https://www.stackhub.me/" style={primaryButton}>
                Start Exploring
              </Button>
            </Section>

            <Text style={closing}>
              Enjoy the exploration,
              <br />
              <strong style={signature}>StackHub team</strong>
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              <a href="https://www.stackhub.me/" style={footerLink}>
                Visit StackHub
              </a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily: "Inter, Arial, sans-serif",
  margin: 0,
  padding: "20px 0",
};

const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #e6ebf1",
  borderRadius: "8px",
  margin: "0 auto",
  maxWidth: "600px",
  padding: "0",
};

const header = {
  backgroundColor: "#000000",
  borderRadius: "8px 8px 0 0",
  padding: "40px 40px 30px",
  textAlign: "center" as const,
};

const logo = {
  color: "#ffffff",
  fontSize: "28px",
  fontWeight: "600",
  margin: "0 0 8px 0",
};

const tagline = {
  color: "#a0aec0",
  fontSize: "14px",
  margin: "0",
};

const content = {
  padding: "40px",
};

const greeting = {
  color: "#2d3748",
  fontSize: "18px",
  lineHeight: "1.5",
  margin: "0 0 20px 0",
};

const paragraph = {
  color: "#4a5568",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 16px 0",
};

// Rendered at body-copy size/weight, not as a visual heading.
const sectionHeading = {
  color: "#4a5568",
  fontSize: "16px",
  lineHeight: "1.6",
  fontWeight: "400",
  margin: "0 0 16px 0",
};

const actionList = {
  margin: "0 0 30px 0",
};

const actionItem = {
  color: "#4a5568",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 12px 0",
  display: "flex",
  alignItems: "flex-start",
};

const bullet = {
  marginRight: "12px",
  fontSize: "16px",
};

const ctaSection = {
  textAlign: "center" as const,
  margin: "30px 0",
};

const primaryButton = {
  backgroundColor: "#000000",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "600",
  padding: "14px 28px",
  textDecoration: "none",
  display: "inline-block",
  border: "none",
  cursor: "pointer",
};

const closing = {
  color: "#4a5568",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0",
};

const signature = {
  color: "#2d3748",
  fontWeight: "600",
};

const footer = {
  backgroundColor: "#f7fafc",
  borderTop: "1px solid #e2e8f0",
  borderRadius: "0 0 8px 8px",
  padding: "30px 40px",
  textAlign: "center" as const,
};

const footerText = {
  color: "#718096",
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "0",
};

const footerLink = {
  color: "#3182ce",
  textDecoration: "underline",
};
