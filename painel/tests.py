from rest_framework.test import APITestCase

from catalogo.models import Categoria, Produto
from usuarios.models import PerfilProdutor, Usuario

PW = "Senha-Forte-123"


class PainelEFrontendTests(APITestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_superuser("admin", "admin@ex.com", PW)
        self.client.post("/api/auth/registro/cliente/", {"username": "cli", "email": "cli@ex.com", "password": PW}, format="json")
        self.client.post(
            "/api/auth/registro/produtor/",
            {"username": "prod", "email": "prod@ex.com", "password": PW, "nome_propriedade": "Sítio Lua"},
            format="json",
        )
        self.cli = Usuario.objects.get(username="cli")
        self.perfil = PerfilProdutor.objects.get(usuario__username="prod")
        self.cat = Categoria.objects.create(nome="Raízes")
        self.prod = Produto.objects.create(produtor=self.perfil, categoria=self.cat, nome="Macaxeira", preco="5.00", estoque="10")

    def _auth(self, username):
        token = self.client.post("/api/auth/login/", {"username": username, "password": PW}, format="json").data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_health_e_rotas_frontend_com_logo(self):
        h = self.client.get("/api/admin/health/")
        self.assertEqual(h.status_code, 200)
        self.assertEqual(h.data["status"], "ok")

        for route in ("/", "/css/style.css", "/js/main.js", "/js/api.js", "/assets/logo.svg", "/assets/logo-dark.svg", "/assets/logo-icon.svg", "/favicon.png"):
            res = self.client.get(route)
            self.assertEqual(res.status_code, 200, f"Falha na rota {route}")
            res.close()

    def test_moderacao_admin_e_bloqueio_proprio_impedido(self):
        self._auth("admin")
        # Não pode bloquear a própria conta
        self.assertEqual(self.client.post(f"/api/admin/usuarios/{self.admin.id}/bloquear/").status_code, 400)

        # Bloquear e reativar cliente
        self.assertEqual(self.client.post(f"/api/admin/usuarios/{self.cli.id}/bloquear/").data["is_active"], False)
        self.assertEqual(self.client.post(f"/api/admin/usuarios/{self.cli.id}/reativar/").data["is_active"], True)

        # Aprovar e suspender produtor
        self.assertEqual(self.client.post(f"/api/admin/produtores/{self.perfil.id}/aprovar/").data["status"], "APROVADO")
        self.assertEqual(self.client.post(f"/api/admin/produtores/{self.perfil.id}/suspender/").data["status"], "SUSPENSO")

        # Ocultar e reexibir produto
        r_oc = self.client.post(f"/api/admin/produtos/{self.prod.id}/ocultar/")
        self.assertEqual(r_oc.status_code, 200)
        self.assertFalse(r_oc.data["ativo"])
        self.assertEqual(r_oc.data["produtor_nome"], "Sítio Lua")
        r_re = self.client.post(f"/api/admin/produtos/{self.prod.id}/reexibir/")
        self.assertTrue(r_re.data["ativo"])
