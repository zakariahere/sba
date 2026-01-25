# SBA Init - Spring Batch Architecture Agent for Claude Code

Initialize the Spring Batch Architecture (SBA) agent in any repository to get expert guidance designing and implementing enterprise-grade Spring Batch applications.

## Installation & Usage

```bash
# Run directly with npx (no install needed)
npx sba-init

# Or install globally
npm install -g sba-init
sba-init

# Initialize in a specific directory
npx sba-init ./my-batch-project

# Force overwrite existing files
npx sba-init --force

# Verbose output
npx sba-init -v
```

## What Gets Created

```
.claude/
├── agents/
│   └── sba.md                      # Main orchestrator agent
├── rules/
│   └── sba-conventions.md          # Project conventions
└── sba/
    ├── phases/                     # 5 workflow phases
    │   ├── 1-discovery.md
    │   ├── 2-architecture.md
    │   ├── 3-design.md
    │   ├── 4-implementation.md
    │   └── 5-review.md
    ├── skills/                     # Technology-specific skills
    │   ├── persistence/            # JPA, MyBatis
    │   ├── databases/              # PostgreSQL, Oracle
    │   ├── patterns/               # Chunk, Partitioning, Fault Tolerance
    │   └── advanced/               # Multi-threaded, Conditional Flows
    ├── templates/                  # Code generation templates
    │   ├── job-config.md
    │   ├── reader-templates.md
    │   ├── processor-templates.md
    │   ├── writer-templates.md
    │   └── testing-templates.md
    └── context/
        └── state-schema.md         # State management definition
```

## Using the Agent in Claude Code

After initialization, start Claude Code in your project:

```bash
claude
```

Then invoke the SBA agent in any of these ways:

1. **Natural language**: "Help me design a Spring Batch job for migrating customer data"
2. **Direct reference**: "Use the sba agent to create an ETL batch job"
3. **Agents command**: Type `/agents` and select `sba`

## The 5-Phase Workflow

The SBA agent guides you through:

| Phase | Purpose | Output |
|-------|---------|--------|
| **1. Discovery** | Gather requirements | Project context, sources, targets |
| **2. Architecture** | Make high-level decisions | Tech stack, ADRs |
| **3. Design** | Detailed design with patterns | Data models, step configs |
| **4. Implementation** | Generate production code | Working Spring Batch job |
| **5. Review** | Validate and optimize | Performance tuning, best practices |

## Quick Commands

Once in an SBA session:

- `sba status` - Show current state and phase
- `sba next` - Move to next phase
- `sba back` - Return to previous phase
- `sba load skill {name}` - Load a specific skill

## Supported Technologies

**Persistence**: JPA, MyBatis, JDBC

**Databases**: PostgreSQL, Oracle, MySQL, SQL Server

**Patterns**:
- Chunk Processing
- Tasklet
- Partitioning (parallel processing)
- Fault Tolerance (skip/retry/restart)
- Multi-threaded Steps
- Conditional Flows
- Job Composition

## Adding Custom Skills

Create new skills by:

1. Add `.md` file in `.claude/sba/skills/{category}/`
2. Register in skill catalog in `.claude/agents/sba.md`
3. Follow the skill template structure

## Token Efficiency

The agent uses progressive loading to stay within Claude's context limits:
- Only loads the current phase (~4-15k tokens)
- Skills loaded on-demand based on tech choices
- Templates loaded just-in-time during implementation

## License

Apache 2.0
