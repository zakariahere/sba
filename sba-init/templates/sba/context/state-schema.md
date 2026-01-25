# SBA State Schema

This document defines the state object structure used throughout the SBA session.

## State Object Definition

```yaml
sba_state:
  # Current workflow phase (1-5)
  current_phase: integer

  # Project context gathered in Discovery phase
  project_context:
    name: string              # Project/job name
    type: enum                # etl|migration|sync|report|custom
    volume: enum              # small|medium|large|enterprise
    description: string       # Brief description
    business_requirements: [] # List of requirements
    constraints: []           # Technical/business constraints

  # Technology stack determined in Architecture phase
  tech_stack:
    persistence: enum         # jpa|mybatis|jdbc
    database: enum            # oracle|postgresql|mysql|sqlserver
    spring_boot: string       # Version (default: "3.2")
    java_version: string      # Version (default: "17")
    additional_deps: []       # Extra dependencies

  # Data sources configuration
  sources:
    - type: enum              # database|file|api|message-queue
      location: string        # Connection string/path
      format: string          # csv|json|xml|fixed|database-table
      schema: object          # Field definitions
      volume_estimate: string # Records count estimate

  # Data targets configuration
  targets:
    - type: enum              # database|file|api|message-queue
      location: string        # Connection string/path
      format: string          # Output format
      schema: object          # Field definitions

  # Architecture Decision Records
  decisions:
    - id: string              # ADR-001, ADR-002, etc.
      title: string           # Decision title
      context: string         # Why this decision was needed
      decision: string        # What was decided
      consequences: []        # Implications

  # Generated artifacts tracking
  artifacts:
    - path: string            # File path
      type: enum              # config|entity|reader|processor|writer|test|properties
      description: string     # What this file does

  # Currently loaded skills (for token management)
  skills_loaded: []           # List of skill names
```

## Volume Classifications

| Classification | Record Count | Recommended Patterns |
|---------------|--------------|---------------------|
| small | < 10,000 | Simple chunk processing |
| medium | 10,000 - 1,000,000 | Chunk with optimized commit intervals |
| large | 1M - 100M | Partitioning, multi-threaded |
| enterprise | > 100M | Remote chunking, distributed processing |

## Project Types

| Type | Description | Common Patterns |
|------|-------------|-----------------|
| etl | Extract-Transform-Load | Chunk processing, transformation |
| migration | Data migration between systems | Partitioning, validation |
| sync | Data synchronization | Delta processing, change detection |
| report | Report generation | Aggregation, file writers |
| custom | Custom processing logic | Varies |

## State Transitions

```
Phase 1 (Discovery) → Populates: project_context, sources, targets
Phase 2 (Architecture) → Populates: tech_stack, decisions
Phase 3 (Design) → Refines: sources, targets schemas; loads skills
Phase 4 (Implementation) → Populates: artifacts
Phase 5 (Review) → Validates: all sections
```

## Compact State Representation

For token efficiency, use this compact format in conversation:

```
[SBA State] Phase: 2 | Type: etl | Vol: medium | Tech: jpa/postgresql
Sources: 1 DB table | Targets: 2 CSV files | Decisions: 3 | Skills: chunk, jpa
```

## State Commands

- `sba state` - Display full state
- `sba state compact` - Display compact state
- `sba state {section}` - Display specific section
- `sba state reset` - Reset to initial state
