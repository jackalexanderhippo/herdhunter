# Herdhunter AWS Sandbox Terraform

This stack deploys a demo-friendly Herdhunter container to AWS using:

- Amazon ECR for the Docker image
- Amazon ECS Fargate for the Next.js app
- An Application Load Balancer on HTTP port 80
- Amazon EFS access point for the SQLite database
- A NAT gateway for outbound access to ePloy and other external APIs
- VPC endpoints for private ECS image pulls, logs, and secrets access

It is intentionally shaped for a Pluralsight / A Cloud Guru sandbox: no custom domain, no ACM certificate, no RDS, and a single desired ECS task by default.

## Prerequisites

- Terraform CLI 1.14.x or newer
- AWS CLI v2
- Docker
- AWS credentials for the sandbox account

Confirm the sandbox identity and region first:

```bash
aws sts get-caller-identity
aws configure get region
```

If the second command is empty, choose the region shown in the sandbox instructions:

```bash
export AWS_REGION=us-east-1
```

## 1. Create the registry and base infrastructure

```bash
cd infra/aws-sandbox
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply -var="deploy_service=false"
```

This first apply creates ECR and the network/storage resources but does not start ECS yet, because there is not an image to run.

## 2. Build and push the image

Run from the repository root:

```bash
cd ../..
export AWS_REGION=us-east-1
export ECR_REPOSITORY_URL=$(terraform -chdir=infra/aws-sandbox output -raw ecr_repository_url)
export IMAGE_TAG=demo

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ECR_REPOSITORY_URL%/*}"

docker build --platform linux/amd64 -t herdhunter:$IMAGE_TAG .
docker tag herdhunter:$IMAGE_TAG "$ECR_REPOSITORY_URL:$IMAGE_TAG"
docker push "$ECR_REPOSITORY_URL:$IMAGE_TAG"
```

## 3. Start ECS

```bash
terraform -chdir=infra/aws-sandbox apply \
  -var="deploy_service=true" \
  -var="image_tag=demo"
```

Open the app:

```bash
terraform -chdir=infra/aws-sandbox output -raw app_url
```

The ALB can take a couple of minutes to report the target healthy after the task starts and Prisma migrations run.

## 4. Check logs

```bash
aws logs tail "$(terraform -chdir=infra/aws-sandbox output -raw cloudwatch_log_group)" \
  --region "$AWS_REGION" \
  --follow
```

## 5. Update after code changes

```bash
export IMAGE_TAG=$(date +%Y%m%d%H%M%S)
export ECR_REPOSITORY_URL=$(terraform -chdir=infra/aws-sandbox output -raw ecr_repository_url)

docker build --platform linux/amd64 -t herdhunter:$IMAGE_TAG .
docker tag herdhunter:$IMAGE_TAG "$ECR_REPOSITORY_URL:$IMAGE_TAG"
docker push "$ECR_REPOSITORY_URL:$IMAGE_TAG"

terraform -chdir=infra/aws-sandbox apply \
  -var="deploy_service=true" \
  -var="image_tag=$IMAGE_TAG"
```

## 6. Tear down the sandbox

Destroy the stack before ending the sandbox session:

```bash
terraform -chdir=infra/aws-sandbox destroy -var="deploy_service=true"
```

If the sandbox has already removed some resources, rerun the destroy after a short wait. ECR is configured with `force_delete=true`, so Terraform can remove images during teardown.

## Notes

- Demo auth bypass is enabled by default. For a public demo this is convenient, but it is not production auth.
- The app uses SQLite on EFS for a low-friction sandbox demo. For production, move to RDS PostgreSQL or Aurora PostgreSQL.
- The task runs in private subnets without public IPs. A single NAT gateway is included so the app can call ePloy and other external APIs at runtime.
- VPC endpoints still handle ECR pulls, CloudWatch logs, Secrets Manager, and S3 image layer access privately.
