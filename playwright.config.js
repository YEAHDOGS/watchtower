export default {
  testDir: "./e2e",
  timeout: 90000,
  reporter: [["list"], ["json", { outputFile: "e2e-report.json" }]],
  use: { actionTimeout: 20000 },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
};
