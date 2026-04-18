/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Prefer `shadow-[var(--flux-shadow-*)]` or theme keys `shadow-flux-*` over ad-hoc long shadow arbitrary values." },
    schema: [],
    messages: {
      longShadow: "Prefer a Flux shadow token (`--flux-shadow-*` / `shadow-flux-*`) instead of a long arbitrary shadow class.",
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
      return /shadow-\[0_[0-9]{2,}px/.test(s);
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (hits(node.value)) {
          context.report({ node, messageId: "longShadow" });
        }
      },
      TemplateElement(node) {
        const v = node.value.cooked ?? node.value.raw;
        if (hits(v)) {
          context.report({ node, messageId: "longShadow" });
        }
      },
    };
  },
};

/** @type {import('eslint').ESLint.Plugin} */
export default {
  rules: {
    "shadow-tokens": rule,
  },
};
