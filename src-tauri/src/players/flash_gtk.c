#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdlib.h>

typedef unsigned long GType;
typedef int gboolean;
typedef void *gpointer;
typedef struct _GList {
    gpointer data;
    struct _GList *next;
    struct _GList *prev;
} GList;
typedef struct {
    int x, y, width, height;
} GtkAllocation;

static gboolean (*check_type)(void *, GType);
static GType (*menu_bar_type)(void);
static GType (*entry_type)(void);
static GType (*layout_type)(void);
static GType (*window_type)(void);
static GType (*container_type)(void);
static GList *(*get_children)(void *);
static void (*list_free)(GList *);
static void (*widget_hide)(void *);
static void (*get_alloc)(void *, GtkAllocation *);
static void (*real_resize)(void *, int, int);
static void (*real_set_title)(void *, const char *);
static unsigned int (*idle_add)(gboolean (*)(gpointer), gpointer);

static int ready;

static void resolve(void) {
    if (ready) return;
    check_type = dlsym(RTLD_DEFAULT, "g_type_check_instance_is_a");
    menu_bar_type = dlsym(RTLD_DEFAULT, "gtk_menu_bar_get_type");
    entry_type = dlsym(RTLD_DEFAULT, "gtk_entry_get_type");
    layout_type = dlsym(RTLD_DEFAULT, "gtk_layout_get_type");
    window_type = dlsym(RTLD_DEFAULT, "gtk_window_get_type");
    container_type = dlsym(RTLD_DEFAULT, "gtk_container_get_type");
    get_children = dlsym(RTLD_DEFAULT, "gtk_container_get_children");
    list_free = dlsym(RTLD_DEFAULT, "g_list_free");
    widget_hide = dlsym(RTLD_DEFAULT, "gtk_widget_hide");
    get_alloc = dlsym(RTLD_DEFAULT, "gtk_widget_get_allocation");
    real_resize = dlsym(RTLD_NEXT, "gtk_window_resize");
    real_set_title = dlsym(RTLD_NEXT, "gtk_window_set_title");
    idle_add = dlsym(RTLD_DEFAULT, "g_idle_add");
    ready = check_type && menu_bar_type && entry_type && layout_type && window_type &&
            container_type && get_children && list_free && widget_hide && get_alloc &&
            real_resize && real_set_title && idle_add;
}

static int is_a(void *widget, GType (*type)(void)) {
    return widget && type && check_type(widget, type());
}

static int is_container(void *widget) {
    return is_a(widget, container_type);
}

static void *find_widget(void *widget, GType (*type)(void)) {
    if (is_a(widget, type)) return widget;
    if (!is_container(widget)) return 0;
    GList *children = get_children(widget);
    void *found = 0;
    for (GList *link = children; link && !found; link = link->next)
        found = find_widget(link->data, type);
    list_free(children);
    return found;
}

/* The URL row is the box whose own children include the address entry. */
static void *url_row(void *widget) {
    if (!is_container(widget)) return 0;
    GList *children = get_children(widget);
    int direct = 0;
    for (GList *link = children; link; link = link->next) {
        if (is_a(link->data, entry_type)) direct = 1;
    }
    if (direct) {
        list_free(children);
        return widget;
    }
    void *found = 0;
    for (GList *link = children; link && !found; link = link->next)
        found = url_row(link->data);
    list_free(children);
    return found;
}

static void hide_chrome(void *window) {
    void *bar = find_widget(window, menu_bar_type);
    void *row = url_row(window);
    if (bar) widget_hide(bar);
    if (row) widget_hide(row);
}

static void fit_stage(void *window) {
    void *layout = find_widget(window, layout_type);
    if (!layout) return;
    GtkAllocation stage;
    get_alloc(layout, &stage);
    if (stage.width > 50 && stage.height > 50)
        real_resize(window, stage.width, stage.height);
}

static void force_title(void *window) {
    if (!real_set_title) real_set_title = dlsym(RTLD_NEXT, "gtk_window_set_title");
    if (real_set_title) real_set_title(window, "AquaStar NEO");
}

/* The launcher passes a PNG path in AQUASTAR_FLASH_ICON. */
static void force_icon(void *window) {
    static gboolean (*set_icon_from_file)(void *, const char *, void *);
    if (!set_icon_from_file)
        set_icon_from_file = dlsym(RTLD_DEFAULT, "gtk_window_set_icon_from_file");
    const char *path = getenv("AQUASTAR_FLASH_ICON");
    if (set_icon_from_file && path && *path) set_icon_from_file(window, path, 0);
}

static gboolean strip(gpointer data) {
    void *window = data;
    if (!is_a(window, window_type)) return 0;
    hide_chrome(window);
    force_title(window);
    force_icon(window);
    fit_stage(window);
    return 0;
}

void gtk_window_set_title(void *window, const char *title) {
    (void)title;
    force_title(window);
}

void gtk_widget_show(void *widget) {
    static void (*real_show)(void *) = 0;
    if (!real_show) real_show = dlsym(RTLD_NEXT, "gtk_widget_show");
    real_show(widget);
    resolve();
    if (!ready) return;
    if (is_a(widget, menu_bar_type)) {
        widget_hide(widget);
        return;
    }
    if (url_row(widget) == widget) {
        widget_hide(widget);
        return;
    }
    if (is_a(widget, window_type)) idle_add(strip, widget);
}

void gtk_window_resize(void *window, int width, int height) {
    resolve();
    if (!ready) {
        void (*fallback)(void *, int, int) = dlsym(RTLD_NEXT, "gtk_window_resize");
        fallback(window, width, height);
        return;
    }
    void *layout = find_widget(window, layout_type);
    if (layout) {
        GtkAllocation stage;
        get_alloc(layout, &stage);
        int extra = height - stage.height;
        if (stage.width > 50 && stage.height > 50 && extra > 0 && extra <= 80) {
            width = stage.width;
            height = stage.height;
        }
    }
    hide_chrome(window);
    real_resize(window, width, height);
}
