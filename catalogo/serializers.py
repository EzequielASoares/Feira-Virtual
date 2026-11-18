from rest_framework import serializers

from .models import Categoria, Produto


class CategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categoria
        fields = ["id", "nome", "descricao", "ativa"]


class ProdutoPublicoSerializer(serializers.ModelSerializer):
    produtor_nome = serializers.CharField(source="produtor.nome_propriedade", read_only=True)
    produtor_cidade = serializers.CharField(source="produtor.cidade", read_only=True)
    produtor_estado = serializers.CharField(source="produtor.estado", read_only=True)
    produtor_aceita_pix = serializers.SerializerMethodField()
    produtor_possui_maquininha = serializers.BooleanField(source="produtor.possui_maquininha", read_only=True)
    produtor_aceita_dinheiro = serializers.BooleanField(source="produtor.aceita_dinheiro", read_only=True)
    categoria_nome = serializers.CharField(source="categoria.nome", read_only=True)
    nota_media = serializers.FloatField(read_only=True, default=None)
    total_avaliacoes = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Produto
        fields = [
            "id", "nome", "descricao", "preco", "unidade_medida", "estoque", "tipo_producao", "imagem",
            "categoria", "categoria_nome", "produtor", "produtor_nome", "produtor_cidade", "produtor_estado",
            "produtor_aceita_pix", "produtor_possui_maquininha", "produtor_aceita_dinheiro",
            "nota_media", "total_avaliacoes",
        ]

    def get_produtor_aceita_pix(self, obj):
        return bool(obj.produtor.chave_pix)


class ProdutoProdutorSerializer(serializers.ModelSerializer):
    categoria_nome = serializers.CharField(source="categoria.nome", read_only=True)

    class Meta:
        model = Produto
        fields = [
            "id", "nome", "descricao", "preco", "unidade_medida", "estoque", "tipo_producao", "imagem",
            "categoria", "categoria_nome", "ativo", "criado_em",
        ]
        read_only_fields = ["criado_em", "categoria_nome"]

    def validate_categoria(self, value):
        if not value.ativa:
            raise serializers.ValidationError("Categoria inativa.")
        return value
