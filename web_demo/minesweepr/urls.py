from django.urls import path

from . import views

urlpatterns = [
    path('player/', views.template_static),
    path('query/', views.template_static),
    path('api/minesweeper_solve/', views.api_solve, name='minesweepr.views.api_solve'),
]
