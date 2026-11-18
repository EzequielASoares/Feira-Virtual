from django.db.models import Avg, Count
from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from usuarios.models import PerfilProdutor
from usuarios.permissions import AdminEscreveTodosLeem, EhProdutor

from .models import Categoria, Produto
from .serializers import CategoriaSerializer, ProdutoProdutorSerializer, ProdutoPublicoSerializer


class CategoriaViewSet(viewsets.ModelViewSet):
    """Qualquer um lista; só o administrador cria/edita/remove."""
    queryset = Categoria.objects.all()
    serializer_class = CategoriaSerializer
    permission_classes = [AdminEscreveTodosLeem]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        user = getattr(self.request, "user", None)
        if not (user and user.is_authenticated and user.tipo == "ADMIN"):
            qs = qs.filter(ativa=True)
        return qs


class CatalogoViewSet(viewsets.ReadOnlyModelViewSet):
    """Catálogo público: só produtos ativos de produtores aprovados e usuários ativos."""
    serializer_class = ProdutoPublicoSerializer
    permission_classes = [AllowAny]
    filterset_fields = ["categoria", "tipo_producao", "produtor"]
    search_fields = ["nome", "descricao", "produtor__nome_propriedade"]
    ordering_fields = ["preco", "nome", "criado_em", "nota_media"]

    def get_queryset(self):
        return (
            Produto.objects
            .filter(
                ativo=True,
                categoria__ativa=True,
                produtor__status=PerfilProdutor.Status.APROVADO,
                produtor__usuario__is_active=True,
            )
            .select_related("produtor", "categoria")
            .annotate(
                nota_media=Avg("avaliacoes__nota"),
                total_avaliacoes=Count("avaliacoes", distinct=True),
            )
            .order_by("nome")
        )


class ProdutoProdutorViewSet(viewsets.ModelViewSet):
    """CRUD dos produtos do próprio produtor (regra: só no seu perfil)."""
    serializer_class = ProdutoProdutorSerializer
    permission_classes = [EhProdutor]
    filterset_fields = ["categoria", "ativo", "tipo_producao"]
    search_fields = ["nome"]

    def get_queryset(self):
        return (
            Produto.objects
            .filter(produtor=self.request.user.perfil_produtor)
            .select_related("categoria")
            .order_by("-criado_em")
        )

    def perform_create(self, serializer):
        serializer.save(produtor=self.request.user.perfil_produtor)
