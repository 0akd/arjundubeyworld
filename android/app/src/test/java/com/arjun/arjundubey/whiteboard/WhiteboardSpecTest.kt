package com.arjun.arjundubey.whiteboard

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WhiteboardSpecTest {
    @Serializable
    private data class SavedBoard(val version: Int, val slides: List<WhiteboardSlide>)

    @Test
    fun goldenSampleUsesBoardFractions() {
        assertEquals(0.006f, WhiteboardSpec.PEN_WIDTH, 0f)
        assertEquals(0.01f, WhiteboardSpec.ERASER_MIN, 0f)
        assertEquals(0.12f, WhiteboardSpec.ERASER_MAX, 0f)
        assertEquals(0.05f, WhiteboardSpec.ERASER_DEFAULT, 0f)

        val saved = Json { ignoreUnknownKeys = true }.decodeFromString<SavedBoard>(
            """
            {
              "version": 2,
              "slides": [
                {
                  "id": 1,
                  "title": "Slide 1",
                  "strokes": [
                    {
                      "points": [{ "x": 0.2, "y": 0.2 }, { "x": 0.8, "y": 0.8 }],
                      "colorArgb": -16777216,
                      "strokeWidth": 0.006,
                      "isEraser": false,
                      "isNormalized": true
                    }
                  ]
                }
              ]
            }
            """.trimIndent(),
        )

        val stroke = saved.slides.single().strokes.single()
        assertEquals(2, saved.version)
        assertEquals(WhiteboardSpec.PEN_WIDTH, stroke.strokeWidth, 0.000001f)
        assertTrue(stroke.isNormalized)
        assertTrue(stroke.points.all { it.x in 0f..1f && it.y in 0f..1f })
    }
}
