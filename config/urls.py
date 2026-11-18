from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

FRONTEND_DIR = settings.BASE_DIR / "frontend"


def frontend_serve(path_rel):
    def view(request):
        return serve(request, path_rel, document_root=str(FRONTEND_DIR))
    return view


def frontend_subdir_serve(subdir):
    def view(request, filepath):
        return serve(request, f"{subdir}/{filepath}", document_root=str(FRONTEND_DIR))
    return view


urlpatterns = [
    path("", frontend_serve("index.html"), name="home"),
    path("favicon.ico", frontend_serve("assets/favicon.png"), name="favicon"),
    path("favicon.png", frontend_serve("assets/favicon.png"), name="favicon-png"),
    # Compatibilidade com caminhos antigos e nova estrutura organizada
    path("style.css", frontend_serve("css/style.css")),
    path("main.js", frontend_serve("js/main.js")),
    re_path(r"^css/(?P<filepath>.+)$", frontend_subdir_serve("css")),
    re_path(r"^js/(?P<filepath>.+)$", frontend_subdir_serve("js")),
    re_path(r"^assets/(?P<filepath>.+)$", frontend_subdir_serve("assets")),
    path("admin/", admin.site.urls),
    path("api/", include("usuarios.urls")),
    path("api/", include("catalogo.urls")),
    path("api/", include("pedidos.urls")),
    path("api/", include("avaliacoes.urls")),
    path("api/admin/", include("painel.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

if settings.SERVE_MEDIA:
    urlpatterns += [
        re_path(
            r"^media/(?P<path>.*)$",
            serve,
            {"document_root": str(settings.MEDIA_ROOT)},
        )
    ]
