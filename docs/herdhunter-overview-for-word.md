# Herdhunter Overview

## Infrastructure Overview

Herdhunter is a Next.js application packaged as a container and deployed as a single ECS Fargate service for the sandbox demo environment. The application is exposed through an AWS Application Load Balancer over HTTP. Container images are stored in Amazon ECR, and the app writes its SQLite database to Amazon EFS so that demo data survives task replacement and redeployment.

The sandbox Terraform stack creates a dedicated VPC with public subnets for the load balancer and private subnets for the ECS tasks. The tasks do not use public IP addresses. A single NAT gateway provides outbound internet access so the app can call ePloy and any other external APIs at runtime. In addition, the stack provisions VPC endpoints for Amazon ECR, CloudWatch Logs, Secrets Manager, and S3 so AWS-native traffic can stay on private connectivity where possible.

Application secrets such as the auth secret are stored in AWS Secrets Manager and injected into the running ECS task. Logs are written to CloudWatch Logs. Health checks are performed through a lightweight `/api/health` endpoint so the load balancer can determine whether the app is ready to serve traffic.

At the application layer, candidate CVs are not stored inside Herdhunter. Instead, when a user opens a CV, the app fetches it live from the configured recruitment provider, currently ePloy. That means the Terraform stack no longer needs any separate CV file storage. The only persistent demo data that the stack stores locally to the app is the SQLite database on EFS.

For production, the current architecture is a pragmatic demo shape rather than a final target state. The likely next steps would be moving the relational data store from SQLite to RDS or Aurora PostgreSQL, introducing HTTPS with ACM and Route 53, and deciding whether provider-fetched CVs should continue to be streamed on demand or copied into an object store such as S3 for longer-term retention and downstream processing.

## Functionality Overview

Herdhunter is a collaborative hiring workspace. It allows teams to track candidates, connect them to open positions, schedule interview stages, collect structured interview notes, and review recommendations across a hiring process.

The candidate workflow starts with either manually creating a candidate record or importing candidate details from the configured recruitment provider. Candidate records can include identity and contact details, profession, open position assignment, notice period, salary expectation, and provider metadata. For the current ePloy-backed setup, CV access is provider-driven rather than file-upload driven.

Each candidate can move through a defined hiring status flow, from new and screening through interview stages, offer, hire, or rejection. Hiring managers can assign candidates to open positions, keep general comments on the candidate record, and review candidate-specific summaries and recommendations.

Interview management is one of the core features of the app. Users can create multiple interview stages per candidate, assign interviewers, attach an interview template, store meeting references such as calendar links, and capture interviewer notes. Templates support structured question sets, making it easier for teams to run consistent interview loops and compare candidates fairly.

The live workspace supports collaborative interview note-taking and scoring. Interviewers can record question-level responses, section scores, and freeform observations. After interviews, the app supports consolidated recommendations and candidate feedback summaries, including recommendations for next steps or alternative roles where appropriate.

The app also includes an open positions view so teams can review candidates associated with a role, track hiring progress against target hires, and add assessment summaries at the role level. Admin users can manage users, invitations, workload visibility, and professions used across the system.

Finally, Herdhunter includes a recruitment provider abstraction. The current implementation supports ePloy for candidate lookup, candidate sync, position sync, feedback push, and live CV retrieval. That keeps the app oriented around being a hiring workspace rather than a system of record for every external artifact.
