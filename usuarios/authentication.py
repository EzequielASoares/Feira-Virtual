from django.conf import settings
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.authentication import CSRFCheck
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication


def _enforce_csrf(request):
    """Executa verificação CSRF padrão do Django quando a autenticação usa cookie."""
    check = CSRFCheck(lambda req: None)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        raise PermissionDenied(f"Falha na verificação CSRF: {reason}")


class CookieJWTAuthentication(JWTAuthentication):
    """Autentica via header Authorization Bearer ou via cookie HttpOnly (com CSRF)."""

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            return super().authenticate(request)

        raw_token = request.COOKIES.get(settings.JWT_COOKIE_ACCESS_NAME)
        if not raw_token:
            return None

        validated_token = self.get_validated_token(raw_token)
        if request.method not in ("GET", "HEAD", "OPTIONS", "TRACE"):
            _enforce_csrf(request)
        return self.get_user(validated_token), validated_token


class CookieJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "usuarios.authentication.CookieJWTAuthentication"
    name = "jwtAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
