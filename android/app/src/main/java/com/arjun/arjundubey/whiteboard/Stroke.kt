package com.arjun.arjundubey.whiteboard

import kotlinx.serialization.Serializable

@Serializable
data class Stroke(
    val points: List<Point>,
    val colorArgb: Int,
    val strokeWidth: Float,
    val isEraser: Boolean = false,
    val isNormalized: Boolean = false
)
