/** @type {import('eslint').Rule.RuleModule} */
const noLiteralColors = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw hex/rgb/rgba in strings; use var(--flux-*) tokens (see TOKENS.md). Alpha tints belong in app/globals.css via color-mix(in srgb, var(--flux-*) …%, transparent).",
    },
    schema: [],
    messages: {
      noLiteral:
        "Avoid raw color literals; use CSS custom properties such as var(--flux-primary) or tokens from app/globals.css.",
    },
  },
  create(context) {
    const filename = context.filename.replace(/\\/g, "/");
    if (filename.includes("/emails/") || filename.includes(".test.")) {
      return {};
    }

    /** @param {string | undefined | null} s */
    function hasBadColor(s) {
      if (!s || typeof s !== "string") return false;
      if (s.includes("var(")) return false;
      if (/#[0-9a-fA-F]{3,8}\b/.test(s)) return true;
      if (/\brgba?\s*\(/i.test(s)) return true;
      return false;
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (hasBadColor(node.value)) {
          context.report({ node, messageId: "noLiteral" });
        }
      },
      TemplateElement(node) {
        const v = node.value.cooked ?? node.value.raw;
        if (hasBadColor(v)) {
          context.report({ node, messageId: "noLiteral" });
        }
      },
    };
  },
};

export default {
  rules: {
    "no-literal-colors": noLiteralColors,
  },
};
