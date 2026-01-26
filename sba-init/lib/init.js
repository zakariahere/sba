const fs = require('fs');
const path = require('path');

/**
 * Initialize SBA agent in target directory
 */
async function initSBA(targetDir, options = {}) {
  const { force = false, verbose = false, type = 'claude' } = options;
  const baseDir = path.join(targetDir, `.${type}`);
  let filesCreated = 0;

  // Check if baseDir already exists
  if (fs.existsSync(baseDir) && !force) {
    const agentFile = path.join(baseDir, 'agents', 'sba.md');
    if (fs.existsSync(agentFile)) {
      throw new Error(
        `.${type}/agents/sba.md already exists. Use --force to overwrite.`
      );
    }
  }

  // Get templates directory
  const templatesDir = path.join(__dirname, '..', 'templates');

  // Create directory structure
  const directories = getDirectories(type);
  for (const dir of directories) {
    const fullPath = path.join(targetDir, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      if (verbose) console.log(`  📁 Created: ${dir}`);
    }
  }

  // Copy all template files
  const fileMappings = getFileMappings(type);
  for (const [templateFile, targetFile] of Object.entries(fileMappings)) {
    const sourcePath = path.join(templatesDir, templateFile);
    const destPath = path.join(targetDir, targetFile);

    if (fs.existsSync(sourcePath)) {
      let content = fs.readFileSync(sourcePath, 'utf8');

      // Replace {{AGENT_DIR}} placeholder with actual directory (e.g., .claude or .github)
      const agentDir = `.${type}`;
      content = content.replace(/\{\{AGENT_DIR\}\}/g, agentDir);

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
 * Get mapping of template files to target locations for a given type
 */
function getFileMappings(type = 'claude') {
  const base = `.${type}`;
  return {
    // Main agent
    'agents/sba.md': `${base}/agents/sba.md`,

    // Rules
    'rules/sba-conventions.md': `${base}/rules/sba-conventions.md`,

    // Context
    'sba/context/state-schema.md': `${base}/sba/context/state-schema.md`,

    // Phases
    'sba/phases/1-discovery.md': `${base}/sba/phases/1-discovery.md`,
    'sba/phases/2-architecture.md': `${base}/sba/phases/2-architecture.md`,
    'sba/phases/3-design.md': `${base}/sba/phases/3-design.md`,
    'sba/phases/4-implementation.md': `${base}/sba/phases/4-implementation.md`,
    'sba/phases/5-review.md': `${base}/sba/phases/5-review.md`,

    // Skills - Persistence
    'sba/skills/persistence/jpa.md': `${base}/sba/skills/persistence/jpa.md`,
    'sba/skills/persistence/mybatis.md': `${base}/sba/skills/persistence/mybatis.md`,

    // Skills - Databases
    'sba/skills/databases/postgresql.md': `${base}/sba/skills/databases/postgresql.md`,
    'sba/skills/databases/oracle.md': `${base}/sba/skills/databases/oracle.md`,

    // Skills - Patterns
    'sba/skills/patterns/chunk-processing.md': `${base}/sba/skills/patterns/chunk-processing.md`,
    'sba/skills/patterns/fault-tolerance.md': `${base}/sba/skills/patterns/fault-tolerance.md`,
    'sba/skills/patterns/partitioning.md': `${base}/sba/skills/patterns/partitioning.md`,
    'sba/skills/patterns/tasklet.md': `${base}/sba/skills/patterns/tasklet.md`,
    'sba/skills/patterns/listeners.md': `${base}/sba/skills/patterns/listeners.md`,

    // Skills - Advanced
    'sba/skills/advanced/multi-threaded.md': `${base}/sba/skills/advanced/multi-threaded.md`,
    'sba/skills/advanced/conditional-flow.md': `${base}/sba/skills/advanced/conditional-flow.md`,

    // Templates
    'sba/templates/job-config.md': `${base}/sba/templates/job-config.md`,
    'sba/templates/reader-templates.md': `${base}/sba/templates/reader-templates.md`,
    'sba/templates/processor-templates.md': `${base}/sba/templates/processor-templates.md`,
    'sba/templates/writer-templates.md': `${base}/sba/templates/writer-templates.md`,
    'sba/templates/testing-templates.md': `${base}/sba/templates/testing-templates.md`
  };
}

/**
 * Get directory structure for a given type
 */
function getDirectories(type = 'claude') {
  const base = `.${type}`;
  return [
    `${base}/agents`,
    `${base}/rules`,
    `${base}/sba/phases`,
    `${base}/sba/skills/persistence`,
    `${base}/sba/skills/databases`,
    `${base}/sba/skills/patterns`,
    `${base}/sba/skills/advanced`,
    `${base}/sba/templates`,
    `${base}/sba/context`
  ];
}

module.exports = { initSBA, getFileMappings };
