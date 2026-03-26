variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-north-1"
}

variable "aws_profile" {
  description = "AWS CLI profile (needs admin-level access for infra changes)"
  type        = string
  default     = "pow-predictor"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "pow-predictor"
}

variable "s3_bucket_name" {
  description = "S3 bucket for frontend assets"
  type        = string
  default     = "pow-predictor-frontend"
}

variable "anthropic_api_key" {
  description = "Anthropic API key for conditions summary Lambda"
  type        = string
  sensitive   = true
}

variable "github_token" {
  description = "GitHub personal access token for feedback issue creation"
  type        = string
  sensitive   = true
}
