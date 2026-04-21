/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn on legacy Tailwind arbitrary alpha token classes; prefer flux-surface tiers or color-mix tokens (Onda 4).",
    },
    schema: [],
    messages: {
      deprecated:
        "Deprecated alpha token in class string; migrate with `scripts/migrate-alpha-tokens.mjs` or use `flux-surface-*` / semantic color-mix.",
    },
  },
  create(context) {
    const filename = context.filename.replace(/\\/g, "/");
    if (filename.includes("/emails/") || filename.includes(".test.")) {
      return {};
    }

    /** @param {string | undefined | null} s */
    function hits(s) {
      if (!s || typeof s !== "string") return false;
      return (
        /\bflux-(?:black|white|primary|secondary|accent|chrome)-alpha-\d{2}\b/.test(s) ||
        /\[[^\]]*flux-(?:black|white|primary)-alpha-/.test(s)
      );
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (hits(node.value)) {
          context.report({ node, messageId: "deprecated" });
        }
      },
      TemplateElement(node) {
        const v = node.value.cooked ?? node.value.raw;
        if (hits(v)) {
          context.report({ node, messageId: "deprecated" });
        }
      },
    };
  },
};

/** @type {import('eslint').ESLint.Plugin} */
export default {
  rules: {
    "no-deprecated-alpha-tokens": rule,
  },
};
