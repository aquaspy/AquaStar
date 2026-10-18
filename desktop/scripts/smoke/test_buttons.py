"""The Play buttons are solid colors with a white label in the middle."""

from PIL import Image

from buttons import BLUE, ORANGE, find_button


def test_orange_center_ignores_the_label_hole():
    image = Image.new("RGB", (200, 220), (13, 27, 42))
    for y in range(20, 60):
        for x in range(30, 150):
            image.putpixel((x, y), ORANGE)
    for y in range(35, 45):
        for x in range(70, 110):
            image.putpixel((x, y), (255, 255, 255))
    # Antialiased text far from the button must not drag the center away.
    for x in (10, 40, 180):
        image.putpixel((x, 200), (224, 176, 115))
    hit = find_button(image, ORANGE)
    assert hit == (89, 39), hit


def test_teal_site_buttons_are_not_the_flash_button():
    image = Image.new("RGB", (120, 40), (42, 157, 143))
    assert find_button(image, BLUE) is None


def test_a_speck_is_not_a_button():
    image = Image.new("RGB", (80, 40), (0, 0, 0))
    image.putpixel((10, 10), BLUE)
    assert find_button(image, BLUE) is None


if __name__ == "__main__":
    test_orange_center_ignores_the_label_hole()
    test_teal_site_buttons_are_not_the_flash_button()
    test_a_speck_is_not_a_button()
    print("button finder ok")
