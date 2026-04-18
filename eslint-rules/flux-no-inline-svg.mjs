/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer Lucide or components/icons over raw inline <svg> in TSX (warn → error rollout).",
    },
    schema: [],
    messages: {
      inlineSvg: "Avoid inline <svg>; use lucide-react or shared icon components.",
    },
  },
  create(context) {
    const filename = context.filename.replace(/\\/g, "/");
    if (!filename.endsWith(".tsx") || filename.includes(".test.")) return {};

    return {
      JSXOpeningElement(node) {
        if (node.name?.type === "JSXIdentifier" && node.name.name === "svg") {
          context.report({ node, messageId: "inlineSvg" });
        }
      },
    };
  },
};

export default {
  rules: {
    "no-inline-svg": rule,
  },
};
