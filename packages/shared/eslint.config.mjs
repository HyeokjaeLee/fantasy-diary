import sharedConfig from "@fantasy-diary/configs/eslint";

export default [
  ...sharedConfig,
  {
    ignores: ["node_modules/", "dist/"],
  },
];
