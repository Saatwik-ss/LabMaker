# Contributing to Codex

Thank you for your interest in contributing to Codex! We welcome contributions from everyone.

## Code of Conduct

Please be respectful and constructive in all interactions.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Create a feature branch (`git checkout -b feature/my-feature`)
4. Make your changes
5. Write or update tests
6. Ensure code quality (`npm run lint && npm run type-check`)
7. Commit with clear messages
8. Push to your fork
9. Create a Pull Request

## Development Setup

```bash
git clone https://github.com/yourusername/codex.git
cd codex
npm install
npm run setup
npm run dev
```

## Code Style

- Use TypeScript
- Follow ESLint rules
- Use meaningful variable/function names
- Add JSDoc comments for public APIs
- Write tests for new features

## Commit Messages

```
feat: Add new feature
fix: Fix a bug
docs: Update documentation
refactor: Refactor code
test: Add or update tests
chore: Update dependencies
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## Pull Request Process

1. Update README.md if needed
2. Update docs/ if adding features
3. Ensure CI/CD passes
4. Request review from maintainers
5. Address feedback
6. Maintainer will merge when approved

## Areas for Contribution

### High Priority
- [ ] Web UI components (Dashboard, Editor, Chat)
- [ ] API route handlers
- [ ] Stock module implementations
- [ ] Documentation improvements

### Medium Priority
- [ ] Performance optimizations
- [ ] Error handling improvements
- [ ] Test coverage expansion

### Nice to Have
- [ ] VS Code extension
- [ ] Example projects
- [ ] Video tutorials

## Questions?

Open a GitHub Discussion or email support@codex.dev

Thank you for contributing! 🙏
