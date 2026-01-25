#!/usr/bin/env node

const path = require('path');
const { initSBA } = require('../lib/init');

const args = process.argv.slice(2);
const targetDir = args[0] || process.cwd();
const options = {
  force: args.includes('--force') || args.includes('-f'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  help: args.includes('--help') || args.includes('-h')
};

if (options.help) {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║         SBA - Spring Batch Architecture Agent Initializer         ║
╚═══════════════════════════════════════════════════════════════════╝

Usage: sba-init [target-directory] [options]

Arguments:
  target-directory    Directory to initialize SBA in (default: current directory)

Options:
  -f, --force         Overwrite existing files
  -v, --verbose       Show detailed output
  -h, --help          Show this help message

Examples:
  sba-init                    Initialize in current directory
  sba-init ./my-project       Initialize in ./my-project
  sba-init . --force          Overwrite existing SBA files

What this creates:
  .claude/
  ├── agents/sba.md           Main orchestrator agent
  ├── rules/sba-conventions.md  Project conventions
  └── sba/
      ├── phases/             5 workflow phases
      ├── skills/             Technology-specific skills
      ├── templates/          Code generation templates
      └── context/            State management

After installation, use in Claude Code:
  - Say "I need to create a Spring Batch job"
  - Or explicitly: "Use the sba agent"
  - Or run: /agents and select SBA

Learn more: https://github.com/your-repo/sba-init
`);
  process.exit(0);
}

const resolvedTarget = path.resolve(targetDir);

console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║         SBA - Spring Batch Architecture Agent Initializer         ║
╚═══════════════════════════════════════════════════════════════════╝
`);

initSBA(resolvedTarget, options)
  .then((result) => {
    console.log(`
✅ SBA Agent initialized successfully!

📁 Created ${result.filesCreated} files in: ${resolvedTarget}/.claude/

🚀 Next steps:
   1. Open Claude Code in this directory
   2. Say: "I need to design a Spring Batch job"
   3. Or explicitly: "Use the sba agent to help me"
   4. Or run: /agents and select "sba"

📖 The agent will guide you through 5 phases:
   Discovery → Architecture → Design → Implementation → Review

💡 Quick commands once in SBA:
   sba status    - Show current phase
   sba next      - Move to next phase
`);
  })
  .catch((error) => {
    console.error(`\n❌ Error: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  });
