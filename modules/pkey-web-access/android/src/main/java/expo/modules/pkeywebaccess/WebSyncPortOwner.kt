package expo.modules.pkeywebaccess

import android.util.Log
import java.net.ServerSocket
import java.util.concurrent.ConcurrentHashMap

/**
 * Process-level owner for the web-sync listen port (7392).
 *
 * After a JS / ReactContext reload, [react-native-tcp-socket] used to keep the
 * native [ServerSocket] alive while a *new* module instance had an empty map —
 * causing EADDRINUSE with no JS handle. We close servers via the library's
 * process-static socket map (patched) so reload can reclaim the port.
 */
object WebSyncPortOwner {
  private const val TAG = "WebSyncPortOwner"
  private const val TCP_MODULE = "com.asterinet.react.tcpsocket.TcpSocketModule"
  private const val TCP_SERVER = "com.asterinet.react.tcpsocket.TcpSocketServer"

  data class ReleaseResult(
    val mapSize: Int,
    val serverCount: Int,
    val closedCount: Int,
    val closedIds: List<Int>,
  )

  /**
   * Close every TcpSocketServer currently bound to [port].
   * Safe no-op if the tcp-socket module is missing or the map is empty.
   */
  @Suppress("UNCHECKED_CAST")
  @Synchronized
  fun releasePort(port: Int): ReleaseResult {
    val closedIds = mutableListOf<Int>()
    var mapSize = 0
    var serverCount = 0
    try {
      val moduleClass = Class.forName(TCP_MODULE)
      val mapField = moduleClass.getDeclaredField("socketMap")
      mapField.isAccessible = true
      val socketMap = mapField.get(null) as? ConcurrentHashMap<Int, Any> ?: return ReleaseResult(0, 0, 0, emptyList())
      mapSize = socketMap.size
      val serverClass = Class.forName(TCP_SERVER)
      val getServerSocket = serverClass.getMethod("getServerSocket")
      val closeMethod = serverClass.getMethod("close")

      for (id in socketMap.keys.toList()) {
        val socket = socketMap[id] ?: continue
        if (!serverClass.isInstance(socket)) continue
        serverCount++
        try {
          val ss = getServerSocket.invoke(socket) as? ServerSocket
          val localPort = ss?.localPort ?: -1
          val isClosed = ss == null || ss.isClosed
          if (ss != null && !isClosed && localPort == port) {
            closeMethod.invoke(socket)
            socketMap.remove(id)
            closedIds.add(id)
          }
        } catch (e: Exception) {
          Log.w(TAG, "Failed closing server id=$id", e)
        }
      }
    } catch (e: ClassNotFoundException) {
      Log.w(TAG, "TcpSocket module not on classpath", e)
    } catch (e: Exception) {
      Log.w(TAG, "releasePort($port) failed", e)
    }
    return ReleaseResult(mapSize, serverCount, closedIds.size, closedIds)
  }
}
