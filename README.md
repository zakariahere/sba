# Spring Batch Architecture Agent (SBA)

> **⚠️ WORK IN PROGRESS**: This project is actively being developed. APIs, file structures, and patterns may change.

A powerful AI agent system for [Claude Code](https://claude.ai/code) that guides you through designing and implementing enterprise-grade Spring Batch applications.

## Why SBA?

Designing Spring Batch applications involves countless decisions:

- **Which reader?** JdbcCursorItemReader vs JdbcPagingItemReader vs JpaPagingItemReader?
- **Chunk size?** 100? 1000? 10000? Depends on your data and infrastructure.
- **Fault tolerance?** Skip? Retry? What exceptions? What limits?
- **Parallelization?** Multi-threaded? Partitioned? Remote chunking?
- **Database optimization?** Batch inserts? Fetch size? Connection pooling?

**SBA encapsulates years of Spring Batch expertise into an AI agent** that:

1. **Asks the right questions** to understand your requirements
2. **Makes architecture decisions** based on your volume, constraints, and tech stack
3. **Applies proven patterns** for your specific use case
4. **Generates production-ready code** following best practices
5. **Reviews and optimizes** the final implementation

## The 5-Phase Workflow

SBA guides you through a structured process:

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐     ┌────────────────┐     ┌──────────┐
│  Discovery  │ ──▶ │ Architecture │ ──▶ │  Design  │ ──▶ │ Implementation │ ──▶ │  Review  │
└─────────────┘     └──────────────┘     └──────────┘     └────────────────┘     └──────────┘
      │                    │                  │                   │                    │
      ▼                    ▼                  ▼                   ▼                    ▼
  Requirements         Decisions          Detailed           Working              Optimized
   Gathered              Made              Design             Code                Solution
```

| Phase | What Happens | Output |
|-------|--------------|--------|
| **Discovery** | Understand business requirements, data sources, volumes, constraints | Project context |
| **Architecture** | Choose patterns, persistence layer, parallelization strategy | ADRs, tech stack |
| **Design** | Detail data models, step configurations, error handling | Design document |
| **Implementation** | Generate job configs, readers, processors, writers, tests | Production code |
| **Review** | Validate against best practices, optimize performance | Final solution |

## Token-Efficient Design

Claude Code has context limits (64k-128k tokens). SBA uses **progressive loading**:

- Only the current phase is loaded (~4-15k tokens)
- Skills are loaded on-demand based on your tech choices
- Templates are loaded just-in-time during implementation

This keeps the agent responsive and focused while having access to comprehensive knowledge.

## Supported Technologies

### Persistence Layers
- **JPA/Hibernate** - With batch optimization patterns
- **MyBatis** - XML and annotation-based mappers
- **JDBC** - Direct JDBC with cursor and paging readers

### Databases
- **PostgreSQL** - With specific optimizations
- **Oracle** - Including partitioning and hints
- *(MySQL, SQL Server coming soon)*

### Patterns & Skills
- Chunk-oriented processing
- Tasklet-based steps
- Partitioning (parallel processing)
- Fault tolerance (skip/retry/restart)
- Multi-threaded steps
- Conditional flows
- Job composition
- Listeners and monitoring

## Installation

### Option 1: NPM Package (Recommended)

```bash
# In your Spring Batch project directory
npx sba-init

# Or with options
npx sba-init --force --verbose
```

### Option 2: Manual Copy

Copy the `.claude/` directory from this repository into your project.

## Usage

1. **Start Claude Code** in your project directory:
   ```bash
   claude
   ```

2. **Invoke the SBA agent** in any of these ways:
   - Natural: *"Help me design a Spring Batch job for customer data migration"*
   - Explicit: *"Use the sba agent to create an ETL batch job"*
   - Command: `/agents` → select `sba`

3. **Follow the phases**. The agent will guide you through discovery, architecture, design, implementation, and review.

### Quick Commands

During an SBA session:
- `sba status` - Show current state and phase
- `sba next` - Move to next phase
- `sba back` - Return to previous phase
- `sba load skill {name}` - Load a specific skill

## Project Structure

```
.claude/
├── agents/
│   └── sba.md                      # Main orchestrator agent
├── rules/
│   └── sba-conventions.md          # Project conventions
└── sba/
    ├── phases/                     # Phase-specific instructions
    │   ├── 1-discovery.md
    │   ├── 2-architecture.md
    │   ├── 3-design.md
    │   ├── 4-implementation.md
    │   └── 5-review.md
    ├── skills/                     # Technology-specific knowledge
    │   ├── persistence/            # JPA, MyBatis patterns
    │   ├── databases/              # PostgreSQL, Oracle optimizations
    │   ├── patterns/               # Chunk, partitioning, fault tolerance
    │   └── advanced/               # Multi-threaded, conditional flows
    ├── templates/                  # Code generation templates
    │   ├── job-config.md
    │   ├── reader-templates.md
    │   ├── processor-templates.md
    │   ├── writer-templates.md
    │   └── testing-templates.md
    └── context/
        └── state-schema.md         # Session state definition

sba-init/                           # NPM package for easy installation
├── package.json
├── bin/cli.js
├── lib/init.js
└── templates/                      # Copy of .claude/ for distribution
```

## Extending SBA

### Adding New Skills

1. Create a new `.md` file in the appropriate `.claude/sba/skills/` subdirectory
2. Follow the skill template structure (overview, patterns, code examples, pitfalls)
3. Register the skill in the catalog in `.claude/agents/sba.md`

### Skill Template Structure

```markdown
# Skill Name

**Purpose**: Brief description

---

## Overview
Conceptual explanation with diagrams

## Patterns
Common usage patterns with code examples

## Configuration
How to configure in Spring Batch

## Best Practices
Do's and don'ts

## Common Pitfalls
What to avoid
```

## Roadmap

- [ ] MySQL and SQL Server database skills
- [ ] Remote chunking pattern
- [ ] Spring Cloud Data Flow integration
- [ ] Kubernetes deployment patterns
- [ ] Monitoring and alerting templates
- [ ] Migration assistant (from legacy batch frameworks)

## Contributing

This project is in early development. Contributions welcome!

1. Fork the repository
2. Create a feature branch
3. Add your skill/pattern/improvement
4. Submit a pull request

## License

MIT

---

**Built for the Spring Batch community** ❤️

*Making enterprise batch processing accessible through AI-assisted design.*
