# AI Agent SOP

## Objective
Implement features in Nepse Portfolio Manager as a disciplined contributor. Integrate investment/technical/fundamental data without technical debt or performance issues.

## Pre-Implementation
- **Search First:** Use `grep_search`/`list_dir` and read `documentation.md` before coding
- **Extend, Don't Duplicate:** Reuse existing components/services—never rebuild what exists
- **Plan Mentally:** Structure steps before editing files
- **Clarify Ambiguity:** Ask before making architectural decisions

## Implementation
- **Backend:** Optimize queries (avoid N+1), batch heavy calculations, cache frequent data access
- **Service Layer:** Keep routes thin; business logic goes in `services/`
- **Security:** Validate inputs, sanitize data, respect auth boundaries
- **Schema Changes:** Create migrations for DB changes; never modify schemas directly
- **Dependencies:** Minimize new packages; justify additions; update requirements

## Code Quality
- **Standards:** Follow existing code style, naming conventions, and project patterns
- **Error Handling:** Implement try/catch, validate responses, handle edge cases
- **Testing:** Write/update tests for new features; verify existing tests pass

## Documentation
- **Update Docs:** Modify `documentation.md` for new endpoints, services, or schemas
- **Inline Comments:** Document complex logic, data transformations, or business rules

## Cleanup
- **Delete Temp Files:** Remove all `/tmp/` or root-level scratch files immediately after use
- **Clean Workspace:** Commit only project-relevant code/docs
- **Token Economy:** Modify only necessary code chunks; brief explanations only