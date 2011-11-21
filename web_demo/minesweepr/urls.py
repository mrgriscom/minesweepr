from django.conf.urls.defaults import *
from django.conf import settings

urlpatterns = patterns('minesweepr.views',
    (r'^api/minesweeper_solve/$', 'api_solve'),
    (r'^', 'template_static'),
)

