const checklist = [
  "Auth login + protected route access",
  "Boards list + open board",
  "Kanban drag and drop",
  "Card modal open/edit/save",
  "Sprint lifecycle: start -> review -> close",
  "Copilot panel open + message stream",
  "Public API v1: boards/cards/sprints/comments read",
  "PWA install prompt + service worker active",
];

process.stdout.write("Release Smoke Checklist\n\n");
checklist.forEach((item, idx) => {
  process.stdout.write(`${idx + 1}. [ ] ${item}\n`);
});

