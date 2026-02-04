# Security Policy

## 🔒 Sandbox Disclaimer

> **This is an educational sandbox implementation. It is NOT intended for production use.**

This repository demonstrates cross-border payment concepts based on the [Nexus Global Payments documentation](https://docs.nexusglobalpayments.org/). It intentionally uses simplified security for ease of demonstration.

## ⚠️ Known Sandbox Limitations

| Area | Sandbox Behavior | Production Requirement |
|------|------------------|------------------------|
| **JWT Secret** | Hardcoded in `.env.example` | Use unique, rotated secrets |
| **Database Credentials** | Default `nexus/nexus_sandbox_password` | Use strong, unique passwords |
| **TLS/HTTPS** | Not enforced | Always enforce TLS 1.3 |
| **Input Validation** | Basic XSD validation | Full schema + business rules |
| **Rate Limiting** | Minimal | Implement per-client limits |
| **Audit Logging** | Demo-level | Full audit trail with SIEM |

## 🛡️ Security Features Demonstrated

Despite being a sandbox, the following security concepts are demonstrated:

- **ISO 20022 XSD Validation**: Structural validation of payment messages
- **UETR Tracking**: Unique End-to-End Transaction Reference for traceability
- **JWT Authentication**: Token-based API authentication pattern
- **Sanctions Screening**: Mock implementation showing integration point
- **Database Constraints**: Referential integrity for financial data

## 📋 Reporting Vulnerabilities

Since this is an educational project, there is no formal vulnerability disclosure process. However, if you discover security issues that could affect learning or demonstration quality:

1. Open a GitHub Issue describing the concern
2. Label it with `security` tag
3. Avoid including exploit code in public issues

## 🔐 Production Deployment Guidance

If adapting this codebase for production use, you **must** implement:

1. **Secrets Management**: Use HashiCorp Vault or AWS Secrets Manager
2. **mTLS**: Mutual TLS for all service-to-service communication
3. **Network Segmentation**: Isolate database and Redis from public access
4. **WAF**: Web Application Firewall for API endpoints
5. **PCI DSS Compliance**: If handling payment card data
6. **Penetration Testing**: Regular third-party security assessments

## 📜 License

MIT License - See [LICENSE](./LICENSE)

---

*Last updated: 2026-02-04*
