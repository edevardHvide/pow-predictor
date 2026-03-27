# --- API Gateway v2 (HTTP API): NVE proxy ---

resource "aws_apigatewayv2_api" "nve_proxy" {
  name          = "${var.project_name}-nve-proxy"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_origins = ["https://powpredictor.info", "https://www.powpredictor.info", "https://d1y1xbjzzgjck0.cloudfront.net", "http://localhost:5173", "http://localhost:4173"]
  }
}

resource "aws_apigatewayv2_integration" "nve_proxy" {
  api_id                 = aws_apigatewayv2_api.nve_proxy.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.nve_proxy.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

resource "aws_apigatewayv2_route" "nve_proxy" {
  api_id    = aws_apigatewayv2_api.nve_proxy.id
  route_key = "GET /api/nve/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.nve_proxy.id}"
}

# --- Conditions Summary route ---

resource "aws_apigatewayv2_integration" "conditions_summary" {
  api_id                 = aws_apigatewayv2_api.nve_proxy.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.conditions_summary.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

resource "aws_apigatewayv2_route" "conditions_summary" {
  api_id    = aws_apigatewayv2_api.nve_proxy.id
  route_key = "POST /api/conditions-summary"
  target    = "integrations/${aws_apigatewayv2_integration.conditions_summary.id}"
}

# --- Feedback route ---

resource "aws_apigatewayv2_integration" "feedback" {
  api_id                 = aws_apigatewayv2_api.nve_proxy.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.feedback.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 15000
}

resource "aws_apigatewayv2_route" "feedback" {
  api_id    = aws_apigatewayv2_api.nve_proxy.id
  route_key = "POST /api/feedback"
  target    = "integrations/${aws_apigatewayv2_integration.feedback.id}"
}

# --- Frontend Errors route ---

resource "aws_apigatewayv2_integration" "frontend_errors" {
  api_id                 = aws_apigatewayv2_api.nve_proxy.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.frontend_errors.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 5000
}

resource "aws_apigatewayv2_route" "frontend_errors" {
  api_id    = aws_apigatewayv2_api.nve_proxy.id
  route_key = "POST /api/errors"
  target    = "integrations/${aws_apigatewayv2_integration.frontend_errors.id}"
}

# --- Monitor route ---

resource "aws_apigatewayv2_integration" "monitor" {
  api_id                 = aws_apigatewayv2_api.nve_proxy.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.monitor.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

resource "aws_apigatewayv2_route" "monitor" {
  api_id    = aws_apigatewayv2_api.nve_proxy.id
  route_key = "GET /api/monitor"
  target    = "integrations/${aws_apigatewayv2_integration.monitor.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.nve_proxy.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 200
    throttling_burst_limit = 500
  }
}
