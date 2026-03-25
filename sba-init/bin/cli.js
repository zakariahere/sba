#!/usr/bin/env node

const path = require('path');
const { initSBA } = require('../lib/init');


const args = process.argv.slice(2);
let targetDir = args[0] || process.cwd();
let type = 'claude';
// Parse --type argument
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--type' && args[i + 1]) {
    type = args[i + 1].toLowerCase();
    // Remove --type and its value from args so targetDir is correct
    args.splice(i, 2);
    break;
  }
}
targetDir = args[0] || process.cwd();
const options = {
  force: args.includes('--force') || args.includes('-f'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  help: args.includes('--help') || args.includes('-h'),
  type
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
  --type <type>       Agent format: claude (default) | github | cursor

╔═══════════════════════════════════════════════════════════════════╗
║  Claude Code users: install as a plugin instead (recommended)     ║
║                                                                   ║
║  /plugin marketplace add github:zakariahere/springbatch-sba       ║
║  /plugin install sba@sba-marketplace                              ║
╚═══════════════════════════════════════════════════════════════════╝

Examples:
  sba-init                           Initialize in current directory
  sba-init ./my-project              Initialize in ./my-project
  sba-init . --force                 Overwrite existing SBA files
  sba-init . --type github           Install for GitHub Copilot
  sba-init . --type cursor           Install for Cursor

What this creates (for non-Claude-Code editors):
  .claude/   (or .github/, .cursor/ depending on --type)
  ├── agents/sba.md              Main orchestrator agent
  ├── rules/sba-conventions.md   Project conventions
  └── sba/
      ├── phases/                5 workflow phases
      ├── skills/                Technology-specific skills
      ├── templates/             Code generation templates
      └── context/               State management

After installation, start the workflow:
  - Say: "I need to create a Spring Batch job"
  - Or invoke the agent directly in your editor

Learn more: https://github.com/zakariahere/springbatch-sba
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

📁 Created ${result.filesCreated} files in: ${resolvedTarget}/.${options.type}/

🚀 Next steps:
   1. Open your editor in this directory
   2. Say: "I need to design a Spring Batch job"
   3. Or explicitly: "Use the sba agent to help me"
   4. Or run: /agents and select "sba"

📖 The agent will guide you through 5 phases:
   Discovery → Architecture → Design → Implementation → Review

💡 Quick commands once in SBA:
   sba status    - Show current phase
   sba next      - Move to next phase

💡 Claude Code users: for the best experience, install as a plugin:
   /plugin marketplace add github:zakariahere/springbatch-sba
   /plugin install sba@sba-marketplace
`);
  })
  .catch((error) => {
    console.error(`\n❌ Error: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  });
