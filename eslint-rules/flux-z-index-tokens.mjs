/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Prefer stacking tokens `z-[var(--flux-z-…)]` over arbitrary numeric z classes in UI sources." },
    schema: [],
    messages: {
      rawZ: "Use a `--flux-z-*` token (see `app/globals.css`) instead of a raw Tailwind z-* arbitrary value.",
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
      return /\bz-\[(?!var\(--flux-z-)[^\]]+\]/.test(s);
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (hits(node.value)) {
          context.report({ node, messageId: "rawZ" });
        }
      },
      TemplateElement(node) {
        const v = node.value.cooked ?? node.value.raw;
        if (hits(v)) {
          context.report({ node, messageId: "rawZ" });
        }
      },
    };
  },
};

/** @type {import('eslint').ESLint.Plugin} */
export default {
  rules: {
    "z-index-tokens": rule,
  },
};
