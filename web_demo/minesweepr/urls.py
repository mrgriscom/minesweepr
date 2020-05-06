from django.conf.urls.defaults import *
from django.conf import settings

dynurls = patterns('minesweepr.views',
    (r'^api/minesweeper_solve/$', 'api_solve'),
)

staticurls = patterns('minesweepr.views',
    (r'^player/$', 'template_static', {'analyzer_mode': False}),
    (r'^analyzer/$', 'template_static', {'analyzer_mode': True}),
)

urlpatterns = patterns('',
    ('^%s' % settings.BASE_URL, include(dynurls)),
    ('^%s' % settings.BASE_STATIC_URL, include(staticurls)),            
)
