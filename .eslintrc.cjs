module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: "detect" } },
  extends: ["eslint:recommended", "plugin:react/recommended", "plugin:react/jsx-runtime"],
  ignorePatterns: ["dist", "node_modules", "downloads"],
  rules: {
    "react/prop-types": "off",
    "no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^(React|_)", ignoreRestSiblings: true },
    ],
    "no-empty": ["warn", { allowEmptyCatch: true }],
    "no-constant-condition": ["warn", { checkLoops: false }],
  },
};
