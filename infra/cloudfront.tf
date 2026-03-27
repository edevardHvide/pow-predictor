# --- CloudFront distribution ---

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-oac"
  description                       = "OAC for Pow Predictor S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Redirect CloudFront default domain to custom domain
resource "aws_cloudfront_function" "redirect_default_domain" {
  name    = "${var.project_name}-redirect"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOF
    function handler(event) {
      var host = event.request.headers.host.value;
      if (host.endsWith('.cloudfront.net')) {
        return {
          statusCode: 301,
          statusDescription: 'Moved Permanently',
          headers: { location: { value: 'https://powpredictor.info' + event.request.uri } }
        };
      }
      return event.request;
    }
  EOF
}

resource "aws_cloudfront_cache_policy" "api_cache" {
  name        = "${var.project_name}-api-cache"
  comment     = "Cache NVE API responses - query string is the cache key"
  min_ttl     = 0
  default_ttl = 1800  # 30 minutes
  max_ttl     = 3600  # 1 hour (Lambda sends Cache-Control: max-age=1800)

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "all"
    }
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  comment             = "Pow Predictor - Snow redistribution simulator"
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  http_version        = "http2"
  is_ipv6_enabled     = true
  aliases             = ["powpredictor.info", "www.powpredictor.info"]

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "${var.project_name}-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  origin {
    domain_name = replace(aws_apigatewayv2_api.nve_proxy.api_endpoint, "https://", "")
    origin_id   = "${var.project_name}-api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # NVE API routes — cached 30min via Lambda Cache-Control header
  ordered_cache_behavior {
    path_pattern             = "/api/nve/*"
    target_origin_id         = "${var.project_name}-api"
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = aws_cloudfront_cache_policy.api_cache.id
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # AllViewerExceptHostHeader
  }

  # POST routes (conditions-summary, feedback, errors) — no caching, forward everything
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "${var.project_name}-api"
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # AllViewerExceptHostHeader
  }

  default_cache_behavior {
    target_origin_id       = "${var.project_name}-s3"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized

    # CloudFront default domain redirect disabled — SafeZone/ISP DNS blocking powpredictor.info
    # function_association {
    #   event_type   = "viewer-request"
    #   function_arn = aws_cloudfront_function.redirect_default_domain.arn
    # }
  }

  # SPA: route 403/404 to index.html for client-side routing
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.frontend.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
