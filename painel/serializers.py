from rest_framework import serializers

from catalogo.models import Produto
from usuarios.models import PerfilProdutor


class ProdutoAdminSerializer(serializers.ModelSerializer):
    produtor_nome = serializers.CharField(source="produtor.nome_propriedade", read_only=True)
    produtor_status = serializers.CharField(source="produtor.status", read_only=True)
    categoria_nome = serializers.CharField(source="categoria.nome", read_only=True)

    class Meta:
        model = Produto
        fields = [
            "id", "nome", "descricao", "preco", "unidade_medida", "estoque",
            "tipo_producao", "imagem", "categoria", "categoria_nome",
            "produtor", "produtor_nome", "produtor_status", "ativo", "criado_em",
        ]
        read_only_fields = fields


class ProdutorAdminSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="usuario.username", read_only=True)
    email = serializers.EmailField(source="usuario.email", read_only=True)
    usuario_ativo = serializers.BooleanField(source="usuario.is_active", read_only=True)

    class Meta:
        model = PerfilProdutor
        fields = [
            "id", "status", "username", "email", "usuario_ativo",
            "nome_propriedade", "descricao", "endereco_propriedade",
            "cidade", "estado", "foto_propriedade",
            "chave_pix", "possui_maquininha", "aceita_dinheiro",
        ]
        read_only_fields = fields
