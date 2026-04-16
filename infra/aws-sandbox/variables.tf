variable "aws_region" {
  description = "AWS region to deploy into. Use the region assigned by the Pluralsight/A Cloud Guru sandbox."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short lowercase project name used in AWS resource names."
  type        = string
  default     = "herdhunter"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,24}$", var.project_name))
    error_message = "project_name must be 3-25 chars, lowercase letters, numbers, and hyphens, starting with a letter."
  }
}

variable "environment" {
  description = "Environment label used in AWS resource names and tags."
  type        = string
  default     = "sandbox"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,24}$", var.environment))
    error_message = "environment must be 3-25 chars, lowercase letters, numbers, and hyphens, starting with a letter."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the demo VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "allowed_http_cidrs" {
  description = "CIDR ranges allowed to reach the public ALB on HTTP."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "deploy_service" {
  description = "Set false for the first apply so Terraform can create the ECR repository before you push an image."
  type        = bool
  default     = true
}

variable "image_tag" {
  description = "Container image tag to run from the managed ECR repository."
  type        = string
  default     = "demo"
}

variable "desired_count" {
  description = "Number of ECS tasks to run."
  type        = number
  default     = 1
}

variable "task_cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 1024
}

variable "demo_auth_bypass" {
  description = "Enable the built-in demo auth bypass. Keep true for a sandbox demo unless you configure Google OAuth."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention period for ECS task logs."
  type        = number
  default     = 7
}
