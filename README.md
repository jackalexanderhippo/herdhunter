# Herdhunter

This is a Next.js + Prisma app for collaborative hiring workflows:
- Candidate tracking and shared notes
- CV access via the configured recruitment provider
- Interview template creation/selection
- Multi-interviewer live workspace with color-coded notes
- Per-question and per-section scoring
- Team review notes

## 1) Run locally

1. Install dependencies:

```bash
pnpm install
```

2. Set up the local DB schema:

```bash
pnpm db:push
```

3. Seed baseline app settings/professions:

```bash
pnpm db:seed
```

4. Start the app:

```bash
pnpm dev
```

5. Open:
- [http://localhost:3000](http://localhost:3000)

## 2) Demo auth bypass

For demo mode, auth is bypassed by default in `.env`:

```env
DEMO_AUTH_BYPASS="true"
```

What this does:
- Skips login prompts
- Treats you as a local admin demo user
- Lets you access dashboard/admin screens immediately

To restore normal auth, set:

```env
DEMO_AUTH_BYPASS="false"
```

Then restart the dev server.

## 3) Demo flow (end-to-end)

1. Go to `Candidates` and create a candidate.
2. Open the candidate and use `Open CV` to fetch the CV from the provider.
3. Go to `Templates` and create an interview template with questions.
4. Back on the candidate, click `Schedule Stage` and select interviewers + template.
5. Open `Open Live Workspace` for that stage to:
- Add shared live notes
- Capture per-question answers + scores
- Save section scorecards
- Add live interview feed notes
6. Return to candidate page to review team notes and interview-stage summaries.

## 4) AWS sandbox deployment

Terraform for a Pluralsight / A Cloud Guru AWS sandbox demo lives in:

- [`infra/aws-sandbox`](infra/aws-sandbox)

The sandbox stack runs the app on ECS Fargate behind an Application Load Balancer, stores the container image in ECR, and uses EFS for the SQLite DB.

Short version:

```bash
cd infra/aws-sandbox
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply -var="deploy_service=false"

cd ../..
export AWS_REGION=us-east-1
export ECR_REPOSITORY_URL=$(terraform -chdir=infra/aws-sandbox output -raw ecr_repository_url)
export IMAGE_TAG=demo

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ECR_REPOSITORY_URL%/*}"

docker build --platform linux/amd64 -t herdhunter:$IMAGE_TAG .
docker tag herdhunter:$IMAGE_TAG "$ECR_REPOSITORY_URL:$IMAGE_TAG"
docker push "$ECR_REPOSITORY_URL:$IMAGE_TAG"

terraform -chdir=infra/aws-sandbox apply \
  -var="deploy_service=true" \
  -var="image_tag=$IMAGE_TAG"

terraform -chdir=infra/aws-sandbox output -raw app_url
```

Read [`infra/aws-sandbox/README.md`](infra/aws-sandbox/README.md) for the full process, update flow, logs, and teardown.

## 5) Branding

The UI is now branded as Herdhunter:
- Logo files in `public/herdhunter-logo.svg` and `public/herdhunter-mark.svg`
- App metadata, sidebar, login page, package name, and seed copy use the Herdhunter name
