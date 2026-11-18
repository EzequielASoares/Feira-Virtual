from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db.models import Avg, Count, Q
from django.middleware.csrf import get_token
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status, viewsets
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import serializers as s
from .models import PerfilProdutor, Usuario
from .permissions import EhEntregador, EhProdutor


def _set_auth_cookies(response, access_token=None, refresh_token=None):
    secure = settings.JWT_COOKIE_SECURE
    samesite = settings.JWT_COOKIE_SAMESITE
    if access_token:
        response.set_cookie(
            key=settings.JWT_COOKIE_ACCESS_NAME,
            value=access_token,
            max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
            httponly=True,
            secure=secure,
            samesite=samesite,
            path="/",
        )
    if refresh_token:
        response.set_cookie(
            key=settings.JWT_COOKIE_REFRESH_NAME,
            value=refresh_token,
            max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
            httponly=True,
            secure=secure,
            samesite=samesite,
            path="/api/auth/",
        )


def _clear_auth_cookies(response):
    response.delete_cookie(settings.JWT_COOKIE_ACCESS_NAME, path="/", samesite=settings.JWT_COOKIE_SAMESITE)
    response.delete_cookie(settings.JWT_COOKIE_REFRESH_NAME, path="/api/auth/", samesite=settings.JWT_COOKIE_SAMESITE)


class CsrfTokenView(APIView):
    """Garante que o cookie CSRF seja emitido para clientes web."""
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(responses=dict)
    def get(self, request):
        token = get_token(request)
        return Response({"csrfToken": token})


class LoginView(TokenObtainPairView):
    """Autentica e define cookies HttpOnly (mantendo resposta JSON compatível com API)."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            raise InvalidToken(exc.args[0]) from exc

        tokens = serializer.validated_data
        cookie_only = request.headers.get("X-Auth-Mode") == "cookie"
        payload = (
            {"user": s.UsuarioSerializer(serializer.user).data}
            if cookie_only
            else {**tokens, "user": s.UsuarioSerializer(serializer.user).data}
        )
        response = Response(payload, status=status.HTTP_200_OK)
        _set_auth_cookies(response, tokens.get("access"), tokens.get("refresh"))
        get_token(request)
        return response


class RefreshView(TokenRefreshView):
    """Renova o access token usando body JSON ou cookie HttpOnly."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        used_cookie = False
        if not data.get("refresh") and settings.JWT_COOKIE_REFRESH_NAME in request.COOKIES:
            data["refresh"] = request.COOKIES.get(settings.JWT_COOKIE_REFRESH_NAME)
            used_cookie = True

        serializer = self.get_serializer(data=data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            raise InvalidToken(exc.args[0]) from exc

        tokens = serializer.validated_data
        cookie_only = used_cookie or request.headers.get("X-Auth-Mode") == "cookie"
        payload = {"detail": "Sessão renovada."} if cookie_only else tokens
        response = Response(payload, status=status.HTTP_200_OK)
        _set_auth_cookies(response, tokens.get("access"), tokens.get("refresh"))
        return response


class RegistroClienteView(generics.CreateAPIView):
    serializer_class = s.RegistroClienteSerializer
    permission_classes = [AllowAny]


class RegistroProdutorView(generics.CreateAPIView):
    serializer_class = s.RegistroProdutorSerializer
    permission_classes = [AllowAny]


class RegistroEntregadorView(generics.CreateAPIView):
    serializer_class = s.RegistroEntregadorSerializer
    permission_classes = [AllowAny]


class LogoutView(APIView):
    """Invalida o refresh token (via payload ou cookie HttpOnly) e limpa os cookies."""
    permission_classes = [AllowAny]
    serializer_class = s.LogoutSerializer

    def post(self, request):
        body_refresh = request.data.get("refresh") if isinstance(request.data, dict) else None
        cookie_refresh = request.COOKIES.get(settings.JWT_COOKIE_REFRESH_NAME)
        token_value = body_refresh or cookie_refresh

        if not token_value:
            # Se já não há token nenhum, apenas limpa cookies e encerra sessão
            if request.headers.get("X-Auth-Mode") == "cookie" or not request.data:
                response = Response(status=status.HTTP_204_NO_CONTENT)
                _clear_auth_cookies(response)
                return response
            return Response({"refresh": ["Este campo é obrigatório."]}, status=status.HTTP_400_BAD_REQUEST)

        try:
            RefreshToken(token_value).blacklist()
        except TokenError:
            # Se veio do corpo JSON explícito (chamada de API), sinaliza 400 como antes
            if body_refresh:
                return Response({"detail": "Token inválido ou já expirado."}, status=status.HTTP_400_BAD_REQUEST)

        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_auth_cookies(response)
        return response


class RecuperarSenhaView(APIView):
    permission_classes = [AllowAny]
    serializer_class = s.RecuperarSenhaSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        ser = s.RecuperarSenhaSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = Usuario.objects.filter(email__iexact=ser.validated_data["email"], is_active=True).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            send_mail(
                "Feira Virtual - recuperação de senha",
                f"Use os dados abaixo em POST /api/auth/redefinir-senha/\n\nuid: {uid}\ntoken: {token}\n",
                None,
                [user.email],
            )
        return Response({"detail": "Se o e-mail existir, enviaremos as instruções."})


class RedefinirSenhaView(APIView):
    permission_classes = [AllowAny]
    serializer_class = s.RedefinirSenhaSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        ser = s.RedefinirSenhaSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        try:
            user = Usuario.objects.get(pk=force_str(urlsafe_base64_decode(d["uid"])))
        except (Usuario.DoesNotExist, ValueError, TypeError, OverflowError):
            user = None
        if not user or not default_token_generator.check_token(user, d["token"]):
            return Response({"detail": "Link inválido ou expirado."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(d["nova_senha"], user)
        except DjangoValidationError as e:
            return Response({"nova_senha": list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(d["nova_senha"])
        user.save()
        return Response({"detail": "Senha alterada com sucesso."})


class MeuPerfilView(generics.RetrieveUpdateAPIView):
    serializer_class = s.UsuarioSerializer

    def get_object(self):
        return self.request.user


class PerfilProdutorView(generics.RetrieveUpdateAPIView):
    serializer_class = s.PerfilProdutorSerializer
    permission_classes = [EhProdutor]

    def get_object(self):
        try:
            return self.request.user.perfil_produtor
        except ObjectDoesNotExist as exc:
            raise NotFound("Perfil de produtor não encontrado para este usuário.") from exc


class PerfilEntregadorView(generics.RetrieveUpdateAPIView):
    serializer_class = s.PerfilEntregadorSerializer
    permission_classes = [EhEntregador]

    def get_object(self):
        try:
            return self.request.user.perfil_entregador
        except ObjectDoesNotExist as exc:
            raise NotFound("Perfil de entregador não encontrado para este usuário.") from exc


class ProdutorPublicoViewSet(viewsets.ReadOnlyModelViewSet):
    """Lista pública de produtores aprovados e ativos com métricas reais."""
    serializer_class = s.ProdutorPublicoSerializer
    permission_classes = [AllowAny]
    search_fields = ["nome_propriedade", "cidade", "estado", "descricao"]
    filterset_fields = ["cidade", "estado"]

    def get_queryset(self):
        return (
            PerfilProdutor.objects
            .filter(status=PerfilProdutor.Status.APROVADO, usuario__is_active=True)
            .annotate(
                nota_media=Avg("avaliacoes__nota"),
                total_avaliacoes=Count("avaliacoes", distinct=True),
                produtos_ativos=Count("produtos", filter=Q(produtos__ativo=True), distinct=True),
            )
            .order_by("nome_propriedade")
        )


class EnderecoViewSet(viewsets.ModelViewSet):
    serializer_class = s.EnderecoSerializer
    pagination_class = None

    def get_queryset(self):
        return self.request.user.enderecos.all().order_by("id")

    def perform_create(self, serializer):
        serializer.save(usuario=self.request.user)
