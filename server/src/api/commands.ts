/**
 * REST API Routes for Pump Commands
 */

import { Router, Request, Response } from 'express';
import { buildFrame } from '../protocol/line-protocol';
import { encodeCommandTransaction, CommandEncoders } from '../protocol/encoder';
import { CommandTransactionData, PumpAddress, SerialConfig } from '../types/protocol';
import { SerialHandler } from '../serial/serial-handler';
import { WebSocketHandler } from '../websocket/ws-handler';

export function createCommandsRouter(serialHandler: SerialHandler, wsHandler?: WebSocketHandler) {
  const router = Router();

  /**
   * POST /api/commands/send
   * Send a command to the pump
   */
  router.post('/send', async (req: Request, res: Response) => {
    try {
      const { command, pumpAddress, control } = req.body;

      if (!command || !pumpAddress) {
        return res.status(400).json({
          error: 'Missing required fields: command, pumpAddress'
        });
      }

      // Validate and parse pump address
      let address: number;
      
      if (typeof pumpAddress === 'string') {
        // Remove 0x prefix if present and parse
        const cleanAddress = pumpAddress.replace(/^0x/i, '');
        address = parseInt(cleanAddress, 16);
        
        // If hex parsing failed, try decimal
        if (isNaN(address)) {
          address = parseInt(pumpAddress, 10);
        }
      } else {
        address = pumpAddress;
      }
      
      // Validate address range
      if (isNaN(address) || address < 0x50 || address > 0x6F) {
        return res.status(400).json({
          error: `Invalid pump address: ${pumpAddress}. Must be between 0x50 (80) and 0x6F (111)`
        });
      }

      // Encode command transaction
      let transactionData: CommandTransactionData;
      try {
        transactionData = parseCommandRequest(command);
      } catch (error: any) {
        return res.status(400).json({
          error: `Invalid command: ${error.message}`
        });
      }

      // Encode transaction
      const transaction = encodeCommandTransaction(transactionData);

      // For AUTHORIZE command, send CD1 only (CD2 should be sent separately if needed)
      // Based on sniffer logs, the working AUTHORIZE is just CD1 without CD2
      const transactions = [transaction];
      
      // NOTE: CD2 (allowed nozzles) should be sent as a separate command before AUTHORIZE
      // if needed. The working implementation sends AUTHORIZE as a simple CD1 command.

      // Determine control byte based on command type
      // From sniffer logs: RESET uses CTRL=0x39, AUTHORIZE uses CTRL=0x3C
      // The control byte appears to be a sequence number or transaction ID
      let controlByte = control;
      if (controlByte === undefined || controlByte === null) {
        // Use command-specific control bytes from working implementation
        if (transactionData.type === 1) {
          const cmd = (transactionData.data as any).command;
          if (cmd === 0x05) { // RESET
            controlByte = 0x39; // From sniffer log line 770
          } else if (cmd === 0x06) { // AUTHORIZE
            controlByte = 0x3C; // From sniffer log line 800
          } else {
            controlByte = 0x00; // Default for other commands
          }
        } else {
          controlByte = 0x00; // Default for non-CD1 commands
        }
      }
      
      // Build frame with determined control byte
      const frame = buildFrame(address, controlByte, transactions);

      // Log the command being sent for debugging
      const commandNames: { [key: number]: string } = {
        0x00: 'RETURN_STATUS',
        0x05: 'RESET',
        0x06: 'AUTHORIZE',
        0x08: 'STOP',
        0x0A: 'SWITCH_OFF'
      };
      const cmdName = transactionData.type === 1 && (transactionData.data as any).command 
        ? commandNames[(transactionData.data as any).command] || `CMD_0x${(transactionData.data as any).command.toString(16)}`
        : `TX_${transactionData.type}`;
      
      console.log(`[SEND] ${cmdName} to pump 0x${address.toString(16)}`);
      const frameHex = frame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      console.log(`[SEND] Frame (${frame.length} bytes):`, frameHex);
      if (transactions.length > 1) {
        console.log(`[SEND] Multiple transactions:`, transactions.map(t => `CD${t.trans} (${t.lng} bytes)`).join(', '));
      }

      // Broadcast log before sending
      if (wsHandler) {
        wsHandler.broadcastLog('sent', `${cmdName} to pump 0x${address.toString(16)}`, {
          command: cmdName,
          address: `0x${address.toString(16)}`,
          frameLength: frame.length,
          transactions: transactions.map(t => `CD${t.trans} (${t.lng} bytes)`).join(', ')
        }, frameHex);
      }

      // Send frame
      await serialHandler.sendFrame(frame);

      res.json({
        success: true,
        commandId: generateCommandId(),
        frame: {
          hex: frame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
          bytes: frame
        }
      });
    } catch (error: any) {
      console.error('Error sending command:', error);
      res.status(500).json({
        error: error.message || 'Failed to send command'
      });
    }
  });

  /**
   * GET /api/status
   * Get current pump status
   */
  router.get('/status', (req: Request, res: Response) => {
    const config = serialHandler.getConfig();
    const connected = serialHandler.getConnectionStatus();

    res.json({
      connected,
      config: {
        port: config.port,
        baudRate: config.baudRate,
        pumpAddress: `0x${config.pumpAddress.toString(16).toUpperCase()}`
      }
    });
  });

  /**
   * POST /api/config
   * Update serial port configuration
   */
  router.post('/config', async (req: Request, res: Response) => {
    try {
      const { port, baudRate, pumpAddress } = req.body;

      if (!port || !baudRate || !pumpAddress) {
        return res.status(400).json({
          error: 'Missing required fields: port, baudRate, pumpAddress'
        });
      }

      // Parse pump address
      let address: number;
      
      if (typeof pumpAddress === 'string') {
        // Remove 0x prefix if present and parse
        const cleanAddress = pumpAddress.replace(/^0x/i, '');
        address = parseInt(cleanAddress, 16);
        
        // If hex parsing failed, try decimal
        if (isNaN(address)) {
          address = parseInt(pumpAddress, 10);
        }
      } else {
        address = pumpAddress;
      }

      // Validate address range
      if (isNaN(address) || address < 0x50 || address > 0x6F) {
        return res.status(400).json({
          error: `Invalid pump address: ${pumpAddress}. Must be between 0x50 (80) and 0x6F (111)`
        });
      }

      // Disconnect if currently connected
      if (serialHandler.getConnectionStatus()) {
        await serialHandler.disconnect();
      }

      // Update configuration
      serialHandler.updateConfig({ port, baudRate, pumpAddress: address as PumpAddress });

      // Reconnect with new settings
      await serialHandler.connect();

      res.json({
        success: true,
        config: {
          port,
          baudRate,
          pumpAddress: `0x${address.toString(16).toUpperCase()}`
        }
      });
    } catch (error: any) {
      console.error('Error updating config:', error);
      res.status(500).json({
        error: error.message || 'Failed to update configuration'
      });
    }
  });

  /**
   * GET /api/history
   * Get transaction history (placeholder - would need to implement storage)
   */
  router.get('/history', (req: Request, res: Response) => {
    // TODO: Implement transaction history storage
    res.json({
      history: [],
      message: 'Transaction history not yet implemented'
    });
  });

  return router;
}

/**
 * Parse command request from API
 */
function parseCommandRequest(command: any): CommandTransactionData {
  switch (command.type) {
    case 'CD1':
      // For CD1, check if allowedNozzles are included (for AUTHORIZE command)
      const cmdData = command.data;
      if (cmdData.allowedNozzles && Array.isArray(cmdData.allowedNozzles) && cmdData.allowedNozzles.length > 0) {
        // Return a special structure that includes both command and allowed nozzles
        // We'll handle this in the send handler
        return {
          type: 1, // CD1_COMMAND
          data: {
            command: cmdData.command,
            allowedNozzles: cmdData.allowedNozzles
          } as any
        };
      }
      return CommandEncoders.commandToPump(command.data.command);
    
    case 'CD2':
      return CommandEncoders.allowedNozzleNumbers(command.data.nozzles);
    
    case 'CD3':
      return CommandEncoders.presetVolume(command.data.volume);
    
    case 'CD4':
      return CommandEncoders.presetAmount(command.data.amount);
    
    case 'CD5':
      return CommandEncoders.priceUpdate(command.data.prices);
    
    case 'CD7':
      return CommandEncoders.commandToOutput(
        command.data.outputFunction,
        command.data.command
      );
    
    case 'CD9':
      return CommandEncoders.setPumpParameters(command.data);
    
    case 'CD13':
      return CommandEncoders.setFillingType(command.data.fillingType);
    
    case 'CD14':
      return CommandEncoders.suspendRequest(command.data.nozzle);
    
    case 'CD15':
      return CommandEncoders.resumeRequest(command.data.nozzle);
    
    case 'CD101':
      return CommandEncoders.requestTotalCounters(command.data.counter);
    
    default:
      throw new Error(`Unknown command type: ${command.type}`);
  }
}

/**
 * Generate unique command ID
 */
function generateCommandId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

