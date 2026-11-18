import io
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from catalogo.models import Categoria, Produto
from usuarios.models import PerfilProdutor, Usuario

PW = "Senha-Forte-123"


def _make_test_png():
    buf = io.BytesIO()
    Image.new("RGB", (20, 20), (60, 150, 50)).save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile("produto.png", buf.read(), content_type="image/png")


class CatalogoTests(APITestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_superuser("admin", "admin@ex.com", PW)
        self.client.post(
            "/api/auth/registro/produtor/",
            {"username": "p1", "email": "p1@ex.com", "password": PW, "nome_propriedade": "Sítio A"},
            format="json",
        )
        self.client.post(
            "/api/auth/registro/produtor/",
            {"username": "p2", "email": "p2@ex.com", "password": PW, "nome_propriedade": "Sítio B"},
            format="json",
        )
        PerfilProdutor.objects.update(status=PerfilProdutor.Status.APROVADO)
        self.cat_ativa = Categoria.objects.create(nome="Frutas", ativa=True)
        self.cat_inativa = Categoria.objects.create(nome="Inativa", ativa=False)

    def _auth(self, username):
        token = self.client.post("/api/auth/login/", {"username": username, "password": PW}, format="json").data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_upload_imagem_e_isolamento_entre_produtores(self):
        with tempfile.TemporaryDirectory() as media_dir:
            with override_settings(MEDIA_ROOT=media_dir):
                self._auth("p1")
                res = self.client.post(
                    "/api/produtor/produtos/",
                    {
                        "nome": "Manga Rosa",
                        "preco": "6.50",
                        "unidade_medida": "KG",
                        "estoque": "12",
                        "tipo_producao": "ORGANICO_CERTIFICADO",
                        "categoria": self.cat_ativa.id,
                        "imagem": _make_test_png(),
                    },
                    format="multipart",
                )
                self.assertEqual(res.status_code, 201, res.data)
                pid = res.data["id"]
                self.assertTrue(bool(res.data["imagem"]))

                # Produtor não cadastra em categoria inativa
                res_inativa = self.client.post(
                    "/api/produtor/produtos/",
                    {
                        "nome": "X",
                        "preco": "5.00",
                        "unidade_medida": "KG",
                        "estoque": "5",
                        "categoria": self.cat_inativa.id,
                    },
                    format="json",
                )
                self.assertEqual(res_inativa.status_code, 400)

                # Outro produtor não pode editar/excluir
                self._auth("p2")
                self.assertEqual(self.client.patch(f"/api/produtor/produtos/{pid}/", {"preco": "1.00"}, format="json").status_code, 404)
                self.assertEqual(self.client.delete(f"/api/produtor/produtos/{pid}/").status_code, 404)

    def test_visibilidade_usuario_bloqueado_e_filtros(self):
        p1 = PerfilProdutor.objects.get(usuario__username="p1")
        Produto.objects.create(
            produtor=p1, categoria=self.cat_ativa, nome="Goiaba", preco="4.00", estoque="10",
            tipo_producao=Produto.TipoProducao.AGROECOLOGICO,
        )
        self.assertEqual(self.client.get("/api/produtos/?search=Goiaba").data["count"], 1)
        self.assertEqual(self.client.get("/api/produtos/?tipo_producao=AGROECOLOGICO").data["count"], 1)

        # Categoria inativa oculta para público
        cats = self.client.get("/api/categorias/").data
        self.assertEqual(len(cats), 1)

        # Bloquear usuário do produtor remove produtos do catálogo público
        p1.usuario.is_active = False
        p1.usuario.save()
        self.assertEqual(self.client.get("/api/produtos/").data["count"], 0)
