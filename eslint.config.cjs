module.exports = [
  {
    // Node.js環境を指定
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['node_modules', 'dist'], // 除外対象
    languageOptions: {
      ecmaVersion: 2021, // 最新のECMAScript機能を有効に
      sourceType: 'module', // ESモジュール対応
      parser: require('@typescript-eslint/parser'), // TypeScript対応
      parserOptions: {
        project: './tsconfig.json', // プロジェクトのtsconfigを利用
      },
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
      prettier: require('eslint-plugin-prettier'),
    },
    rules: {
      'prettier/prettier': 'warn',
      // 関数とカッコはあけない(function hoge() {/** */})
      'func-call-spacing': ['warn', 'never'],
      // true/falseを無駄に使うな
      'no-unneeded-ternary': 'warn',
      // varは禁止
      'no-var': 'error',
      // かっこの中はスペースなし
      'space-in-parens': ['warn', 'never'],
      // コンソールは許可
      'no-console': 'off',
      // カンマの前後にスペース入れる
      'comma-spacing': 'warn',
      // 配列のindexに空白を入れない
      'computed-property-spacing': 'warn',
      // キーの空白
      'key-spacing': 'warn',
      // キーワードの前後には適切なスペースを入れる
      'keyword-spacing': 'warn',
      // 引数'_'は許容
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
];
