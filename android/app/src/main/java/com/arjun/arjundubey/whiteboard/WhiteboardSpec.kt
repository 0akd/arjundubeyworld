package com.arjun.arjundubey.whiteboard

/**
 * Board units shared with the web client. See WHITEBOARD_SPEC.md.
 * Lengths are fractions of the square board side, never raw px or dp.
 */
object WhiteboardSpec {
    const val PEN_WIDTH = 0.006f
    const val ERASER_MIN = 0.01f
    const val ERASER_MAX = 0.12f
    const val ERASER_DEFAULT = 0.05f
}
