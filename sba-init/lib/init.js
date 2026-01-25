const fs = require('fs');
const path = require('path');

/**
 * Initialize SBA agent in target directory
 */
async function initSBA(targetDir, options = {}) {
  const { force = false, verbose = false } = options;

  const claudeDir = path.join(targetDir, '.claude');
  let filesCreated = 0;

  // Check if .claude already exists
  if (fs.existsSync(claudeDir) && !force) {
    const agentFile = path.join(claudeDir, 'agents', 'sba.md');
    if (fs.existsSync(agentFile)) {
      throw new Error(
        '.claude/agents/sba.md already exists. Use --force to overwrite.'
      );
    }
  }

  // Get templates directory
  const templatesDir = path.join(__dirname, '..', 'templates');

  // Create directory structure
  const directories = [
    '.claude/agents',
    '.claude/rules',
    '.claude/sba/phases',
    '.claude/sba/skills/persistence',
    '.claude/sba/skills/databases',
    '.claude/sba/skills/patterns',
    '.claude/sba/skills/advanced',
    '.claude/sba/templates',
    '.claude/sba/context'
  ];

  for (const dir of directories) {
    const fullPath = path.join(targetDir, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      if (verbose) console.log(`  📁 Created: ${dir}`);
    }
  }

  // Copy all template files
  const fileMappings = getFileMappings();

  for (const [templateFile, targetFile] of Object.entries(fileMappings)) {
    const sourcePath = path.join(templatesDir, templateFile);
    const destPath = path.join(targetDir, targetFile);

    if (fs.existsSync(sourcePath)) {
      const content = fs.readFileSync(sourcePath, 'utf8');

      // Check if file exists and we're not forcing
      if (fs.existsSync(destPath) && !force) {
        if (verbose) console.log(`  ⏭️  Skipped (exists): ${targetFile}`);
        continue;
      }

      fs.writeFileSync(destPath, content, 'utf8');
      filesCreated++;
      if (verbose) console.log(`  ✅ Created: ${targetFile}`);
    } else {
      if (verbose) console.log(`  ⚠️  Template not found: ${templateFile}`);
    }
  }

  return { filesCreated, targetDir };
}

/**
 * Get mapping of template files to target locations
 */
function getFileMappings() {
  return {
    // Main agent
    'agents/sba.md': '.claude/agents/sba.md',

    // Rules
    'rules/sba-conventions.md': '.claude/rules/sba-conventions.md',

    // Context
    'sba/context/state-schema.md': '.claude/sba/context/state-schema.md',

    // Phases
    'sba/phases/1-discovery.md': '.claude/sba/phases/1-discovery.md',
    'sba/phases/2-architecture.md': '.claude/sba/phases/2-architecture.md',
    'sba/phases/3-design.md': '.claude/sba/phases/3-design.md',
    'sba/phases/4-implementation.md': '.claude/sba/phases/4-implementation.md',
    'sba/phases/5-review.md': '.claude/sba/phases/5-review.md',

    // Skills - Persistence
    'sba/skills/persistence/jpa.md': '.claude/sba/skills/persistence/jpa.md',
    'sba/skills/persistence/mybatis.md': '.claude/sba/skills/persistence/mybatis.md',

    // Skills - Databases
    'sba/skills/databases/postgresql.md': '.claude/sba/skills/databases/postgresql.md',
    'sba/skills/databases/oracle.md': '.claude/sba/skills/databases/oracle.md',

    // Skills - Patterns
    'sba/skills/patterns/chunk-processing.md': '.claude/sba/skills/patterns/chunk-processing.md',
    'sba/skills/patterns/fault-tolerance.md': '.claude/sba/skills/patterns/fault-tolerance.md',
    'sba/skills/patterns/partitioning.md': '.claude/sba/skills/patterns/partitioning.md',
    'sba/skills/patterns/tasklet.md': '.claude/sba/skills/patterns/tasklet.md',
    'sba/skills/patterns/listeners.md': '.claude/sba/skills/patterns/listeners.md',

    // Skills - Advanced
    'sba/skills/advanced/multi-threaded.md': '.claude/sba/skills/advanced/multi-threaded.md',
    'sba/skills/advanced/conditional-flow.md': '.claude/sba/skills/advanced/conditional-flow.md',

    // Templates
    'sba/templates/job-config.md': '.claude/sba/templates/job-config.md',
    'sba/templates/reader-templates.md': '.claude/sba/templates/reader-templates.md',
    'sba/templates/processor-templates.md': '.claude/sba/templates/processor-templates.md',
    'sba/templates/writer-templates.md': '.claude/sba/templates/writer-templates.md',
    'sba/templates/testing-templates.md': '.claude/sba/templates/testing-templates.md'
  };
}

module.exports = { initSBA, getFileMappings };
