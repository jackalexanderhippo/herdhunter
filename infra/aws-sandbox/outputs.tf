output "app_url" {
  description = "Public HTTP URL for the Herdhunter demo. It returns 503 until deploy_service=true and the ECS task is healthy."
  value       = "http://${aws_lb.app.dns_name}"
}

output "ecr_repository_url" {
  description = "ECR repository URL to tag and push the Docker image to."
  value       = aws_ecr_repository.app.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.app.name
}

output "ecs_service_name" {
  description = "ECS service name, when deploy_service=true."
  value       = var.deploy_service ? aws_ecs_service.app[0].name : null
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for the ECS task."
  value       = aws_cloudwatch_log_group.app.name
}
