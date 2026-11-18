from django.db import connection
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from avaliacoes.models import Reclamacao
from avaliacoes.serializers import ReclamacaoAdminSerializer
from catalogo.models import Produto
from pedidos.models import Pedido
from pedidos.serializers import PedidoSerializer
from usuarios.models import PerfilProdutor, Usuario
from usuarios.permissions import EhAdmin
from usuarios.serializers import UsuarioAdminSerializer

from . import services
from .serializers import ProdutoAdminSerializer, ProdutorAdminSerializer


class HealthCheckView(APIView):
    """Verifica saúde da aplicação e conexão com o banco de dados."""
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(responses=dict)
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            return Response({"status": "ok", "database": "connected"})
        except Exception:
            return Response(
                {"status": "error", "database": "disconnected"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class UsuarioAdminViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Usuario.objects.all().order_by("-date_joined")
    serializer_class = UsuarioAdminSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["tipo", "is_active"]
    search_fields = ["username", "email", "first_name", "last_name"]

    @action(detail=True, methods=["post"])
    def bloquear(self, request, pk=None):
        user = services.alterar_status_usuario(self.get_object(), request.user, False)
        return Response(UsuarioAdminSerializer(user).data)

    @action(detail=True, methods=["post"])
    def reativar(self, request, pk=None):
        user = services.alterar_status_usuario(self.get_object(), request.user, True)
        return Response(UsuarioAdminSerializer(user).data)


class ProdutorAdminViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = PerfilProdutor.objects.select_related("usuario").order_by("id")
    serializer_class = ProdutorAdminSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["status"]
    search_fields = ["nome_propriedade", "usuario__username", "cidade"]

    @action(detail=True, methods=["post"])
    def aprovar(self, request, pk=None):
        perfil = services.alterar_status_produtor(self.get_object(), PerfilProdutor.Status.APROVADO)
        return Response(ProdutorAdminSerializer(perfil).data)

    @action(detail=True, methods=["post"])
    def suspender(self, request, pk=None):
        perfil = services.alterar_status_produtor(self.get_object(), PerfilProdutor.Status.SUSPENSO)
        return Response(ProdutorAdminSerializer(perfil).data)


class ProdutoAdminViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Moderação: o administrador pode ocultar/reexibir produtos cadastrados."""
    queryset = Produto.objects.select_related("produtor", "categoria").order_by("-criado_em")
    serializer_class = ProdutoAdminSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["ativo", "categoria", "produtor"]
    search_fields = ["nome", "produtor__nome_propriedade"]

    @action(detail=True, methods=["post"])
    def ocultar(self, request, pk=None):
        p = services.alterar_visibilidade_produto(self.get_object(), False)
        return Response(ProdutoAdminSerializer(p).data)

    @action(detail=True, methods=["post"])
    def reexibir(self, request, pk=None):
        p = services.alterar_visibilidade_produto(self.get_object(), True)
        return Response(ProdutoAdminSerializer(p).data)


class PedidoAdminViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = (
        Pedido.objects
        .select_related("produtor", "cliente", "entregador")
        .prefetch_related("itens", "historico")
    )
    serializer_class = PedidoSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["status", "produtor", "cliente", "modalidade"]


class ReclamacaoAdminViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Reclamacao.objects.select_related("cliente", "pedido__produtor")
    serializer_class = ReclamacaoAdminSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["status"]
    http_method_names = ["get", "patch", "head", "options"]


class IndicadoresView(APIView):
    permission_classes = [EhAdmin]

    @extend_schema(responses=dict)
    def get(self, request):
        return Response(services.obter_indicadores())
