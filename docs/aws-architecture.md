# AWS Deployment Recommendation

## Current sandbox demo path

The repository includes a Terraform stack at `infra/aws-sandbox` for a Pluralsight / A Cloud Guru sandbox demo.

It provisions:
- ECR for the app image
- ECS Fargate for the Next.js container
- Public Application Load Balancer on HTTP
- EFS access point for the SQLite database
- VPC endpoints for private ECR pulls, CloudWatch logs, Secrets Manager, and S3 image layer access

This is intentionally a low-friction demo stack. It avoids a NAT gateway, custom domain, TLS certificate, and managed database to fit short-lived sandbox use.

## Recommended production datastore
- Primary transactional store: Amazon Aurora PostgreSQL (or RDS PostgreSQL).
- Reason: strong relational integrity for candidates/interviews/users/scores, good Prisma support, and easy migration tooling.

## Real-time collaboration at scale
- Current app implementation: short-interval polling for live interview workspace updates.
- Recommended production upgrade: add ElastiCache Redis pub/sub and a websocket gateway.
- Practical path:
  - Keep Next.js API for CRUD.
  - Add websocket service (ECS/Fargate) that publishes/consumes Redis channels per interview.
  - Broadcast interview note/response/score updates to connected clients in near real time.

## File and retention handling
- CVs are currently fetched live from the recruitment provider rather than stored inside the app.
- A future production design can still copy CVs to S3 if offline retention, archival, or downstream processing becomes necessary.

## Terraform environment strategy
- Use three isolated stacks: `sandbox`, `stage`, `prod`.
- Keep shared modules for: VPC, DB, compute, Redis, S3, IAM, secrets, monitoring.
- Separate state per environment (S3 backend + DynamoDB lock table).
- Promote by artifact version (container image tag), not by rebuilding infrastructure differently in each environment.
